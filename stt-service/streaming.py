import numpy as np
import asyncio
from typing import AsyncGenerator
from model import VoxtralModel
from config import HOP_LENGTH, AUDIO_LENGTH_PER_TOK, N_FFT, DEFAULT_NUM_DELAY_TOKENS
from inference import get_text_prompt_ids

NUM_LEFT_PAD_TOKENS = 32

class StreamingTranscriber:
    def __init__(self, model: VoxtralModel):
        self.model = model
        self.audio_buffer = np.zeros(0, dtype=np.float32)
        self.is_stopped = False
        
        self.num_mel_frames_first_audio_chunk = (DEFAULT_NUM_DELAY_TOKENS + 1) * AUDIO_LENGTH_PER_TOK
        self.num_samples_first_audio_chunk = (self.num_mel_frames_first_audio_chunk - 1) * HOP_LENGTH + (N_FFT // 2)
        self.num_samples_per_audio_chunk = AUDIO_LENGTH_PER_TOK * HOP_LENGTH + N_FFT
        
        self.enc_past_seq_len = 0
        self.dec_past_seq_len = 0
        self.batch_size = 1
        
        self.enc_padding_cache = np.zeros((self.batch_size, 1408, 2), dtype=np.float32)
        self.enc_kv_cache = {}
        for i in range(32):
            self.enc_kv_cache[f"past_key_values.{i}.key"] = np.zeros((self.batch_size, 32, 0, 64), dtype=np.float32)
            self.enc_kv_cache[f"past_key_values.{i}.value"] = np.zeros((self.batch_size, 32, 0, 64), dtype=np.float32)
            
        self.dec_kv_cache = {}
        for i in range(26):
            self.dec_kv_cache[f"past_key_values.{i}.key"] = np.zeros((self.batch_size, 8, 0, 128), dtype=np.float32)
            self.dec_kv_cache[f"past_key_values.{i}.value"] = np.zeros((self.batch_size, 8, 0, 128), dtype=np.float32)
            
        self.audio_embed_queue = np.zeros((0, 3072), dtype=np.float32)
        self.tokenizer = model.tokenizer
        self.token_cache = []
        self.print_len = 0
        
    async def add_audio_chunk(self, pcm_chunk: np.ndarray):
        self.audio_buffer = np.concatenate([self.audio_buffer, pcm_chunk])
        
    def stop(self):
        self.is_stopped = True
        
    async def _encode_chunk(self, mel_features: np.ndarray):
        audio_seq_length = mel_features.shape[2]
        conv2_output_len = ((1 + audio_seq_length - 3) // 2) + 1
        
        total_seq_len = self.enc_past_seq_len + conv2_output_len
        attention_mask = np.ones((self.batch_size, total_seq_len), dtype=np.int64)
        position_ids = np.arange(self.enc_past_seq_len, total_seq_len, dtype=np.int64).reshape((self.batch_size, conv2_output_len))
        
        inputs = {
            "input_features": mel_features,
            "attention_mask": attention_mask,
            "position_ids": position_ids,
            "past_padding_cache": self.enc_padding_cache,
            **self.enc_kv_cache
        }
        
        outputs = self.model.audio_encoder.run(None, inputs)
        audio_embeds = outputs[0][0] # [num_audio_tokens, 3072]
        self.enc_padding_cache = outputs[1]
        
        for i in range(32):
            self.enc_kv_cache[f"past_key_values.{i}.key"] = outputs[i * 2 + 2]
            self.enc_kv_cache[f"past_key_values.{i}.value"] = outputs[i * 2 + 3]
            
        self.enc_past_seq_len = total_seq_len
        self.audio_embed_queue = np.concatenate([self.audio_embed_queue, audio_embeds], axis=0)

    def _flush_decoded_text(self):
        if not self.token_cache:
            return None
        text = self.tokenizer.decode(self.token_cache, skip_special_tokens=True)
        printable = text[self.print_len:]
        self.print_len = len(text)
        return printable if printable else None
        
    async def get_transcription_updates(self) -> AsyncGenerator[str, None]:
        from audio import compute_mel_spectrogram
        
        while len(self.audio_buffer) < self.num_samples_first_audio_chunk and not self.is_stopped:
            await asyncio.sleep(0.05)
            
        if self.is_stopped and len(self.audio_buffer) == 0:
            return
            
        raw_audio_length_per_tok = AUDIO_LENGTH_PER_TOK * HOP_LENGTH
        num_left_pad_samples = NUM_LEFT_PAD_TOKENS * raw_audio_length_per_tok
        padded_audio = np.pad(self.audio_buffer[:self.num_samples_first_audio_chunk], (num_left_pad_samples, 0), mode='constant')
        
        mel_features = compute_mel_spectrogram(padded_audio)
        await self._encode_chunk(mel_features)
        
        prompt_ids = get_text_prompt_ids()
        input_ids = np.array([prompt_ids], dtype=np.int64)
        inputs_embeds = self.model.embed_tokens.run(None, {"input_ids": input_ids})[0] # [1, seq_len, 3072]
        seq_len = inputs_embeds.shape[1]
        
        n_consume = min(seq_len, len(self.audio_embed_queue))
        inputs_embeds[0, :n_consume, :] += self.audio_embed_queue[:n_consume]
        self.audio_embed_queue = self.audio_embed_queue[n_consume:]
        
        dec_inputs = {
            "inputs_embeds": inputs_embeds,
            "attention_mask": np.ones((self.batch_size, self.dec_past_seq_len + seq_len), dtype=np.int64),
            **self.dec_kv_cache
        }
        
        outputs = self.model.decoder.run(None, dec_inputs)
        logits = outputs[0]
        for i in range(26):
            self.dec_kv_cache[f"past_key_values.{i}.key"] = outputs[i * 2 + 1]
            self.dec_kv_cache[f"past_key_values.{i}.value"] = outputs[i * 2 + 2]
            
        self.dec_past_seq_len += seq_len
        next_token_id = int(np.argmax(logits[0, -1, :]))
        
        if next_token_id == 2:
            return
            
        self.token_cache.append(next_token_id)
        new_text = self._flush_decoded_text()
        if new_text:
            yield new_text
            
        mel_frame_idx = self.num_mel_frames_first_audio_chunk
        win_half = N_FFT // 2
        start_mel_idx = mel_frame_idx * HOP_LENGTH - win_half
        
        while not self.is_stopped or len(self.audio_buffer) >= start_mel_idx + self.num_samples_per_audio_chunk:
            end_needed = start_mel_idx + self.num_samples_per_audio_chunk
            
            if len(self.audio_buffer) >= end_needed:
                batch_end_sample = end_needed
                while batch_end_sample + raw_audio_length_per_tok <= len(self.audio_buffer):
                    batch_end_sample += raw_audio_length_per_tok
                    
                chunk_audio = self.audio_buffer[start_mel_idx:batch_end_sample]
                chunk_mel = compute_mel_spectrogram(chunk_audio)
                await self._encode_chunk(chunk_mel)
                
                mel_frame_idx += chunk_mel.shape[2]
                start_mel_idx = mel_frame_idx * HOP_LENGTH - win_half
            else:
                if self.is_stopped:
                    break
                await asyncio.sleep(0.05)
                continue
                
            # If we don't have audio_embeds to consume, wait for more audio
            if len(self.audio_embed_queue) == 0:
                continue

            # Run 1 decode step
            next_input_ids = np.array([[next_token_id]], dtype=np.int64)
            next_inputs_embeds = self.model.embed_tokens.run(None, {"input_ids": next_input_ids})[0]
            
            next_inputs_embeds[0, 0, :] += self.audio_embed_queue[0]
            self.audio_embed_queue = self.audio_embed_queue[1:]
            
            dec_inputs = {
                "inputs_embeds": next_inputs_embeds,
                "attention_mask": np.ones((self.batch_size, self.dec_past_seq_len + 1), dtype=np.int64),
                **self.dec_kv_cache
            }
            
            outputs = self.model.decoder.run(None, dec_inputs)
            logits = outputs[0]
            for i in range(26):
                self.dec_kv_cache[f"past_key_values.{i}.key"] = outputs[i * 2 + 1]
                self.dec_kv_cache[f"past_key_values.{i}.value"] = outputs[i * 2 + 2]
                
            self.dec_past_seq_len += 1
            next_token_id = int(np.argmax(logits[0, -1, :]))
            
            if next_token_id == 2:
                break
                
            if next_token_id not in self.model.tokenizer.get_vocab().values():
                pass
                
            self.token_cache.append(next_token_id)
            new_text = self._flush_decoded_text()
            if new_text:
                yield new_text
