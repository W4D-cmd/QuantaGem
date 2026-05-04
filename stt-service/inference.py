import numpy as np
from model import VoxtralModel

def get_text_prompt_ids() -> list[int]:
    return [1] + [32] * 6

def transcribe_batch(model: VoxtralModel, audio: np.ndarray) -> str:
    from audio import compute_mel_spectrogram
    
    # 1. Compute full mel spectrogram
    right_pad_samples = 21760
    padded_audio = np.pad(audio, (0, right_pad_samples), mode='constant')
    
    mel_features = compute_mel_spectrogram(padded_audio)
    
    batch_size = 1
    audio_seq_length = mel_features.shape[2]
    # conv2_output_len = Math.floor((CONV2_LEFT_PAD + audio_seq_len - 3) / 2) + 1
    # CONV2_LEFT_PAD = 1
    enc_seq_len = ((1 + audio_seq_length - 3) // 2) + 1
    
    # 2. Run audio encoder
    enc_inputs = {
        "input_features": mel_features,
        "attention_mask": np.ones((batch_size, enc_seq_len), dtype=np.int64),
        "position_ids": np.arange(0, enc_seq_len, dtype=np.int64).reshape((batch_size, enc_seq_len)),
        "past_padding_cache": np.zeros((batch_size, 1408, 2), dtype=np.float32)
    }
    for i in range(32):
        enc_inputs[f"past_key_values.{i}.key"] = np.zeros((batch_size, 32, 0, 64), dtype=np.float32)
        enc_inputs[f"past_key_values.{i}.value"] = np.zeros((batch_size, 32, 0, 64), dtype=np.float32)
        
    enc_outputs = model.audio_encoder.run(None, enc_inputs)
    audio_embeds = enc_outputs[0] # [1, num_audio_tokens, 3072]
    num_audio_tokens = audio_embeds.shape[1]
    
    # 3. Prepare initial input_ids for prefill
    # The length of input_ids should match the number of audio tokens.
    prompt_ids = get_text_prompt_ids()
    input_ids_list = prompt_ids.copy()
    if num_audio_tokens > len(input_ids_list):
        input_ids_list += [32] * (num_audio_tokens - len(input_ids_list))
    input_ids = np.array([input_ids_list[:num_audio_tokens]], dtype=np.int64)
    
    # 4. Run embed_tokens
    inputs_embeds = model.embed_tokens.run(None, {"input_ids": input_ids})[0]
    
    # Add audio_embeds to inputs_embeds
    # If inputs_embeds is smaller, we only add up to its length
    min_len = min(inputs_embeds.shape[1], audio_embeds.shape[1])
    inputs_embeds[:, :min_len, :] += audio_embeds[:, :min_len, :]
    
    # 5. Decoder Autoregressive Loop
    dec_seq_len = inputs_embeds.shape[1]
    past_sequence_length = 0
    generated_tokens = []
    
    # Initial decoder inputs
    dec_inputs = {
        "inputs_embeds": inputs_embeds,
        "attention_mask": np.ones((batch_size, past_sequence_length + dec_seq_len), dtype=np.int64)
    }
    for i in range(26):
        dec_inputs[f"past_key_values.{i}.key"] = np.zeros((batch_size, 8, past_sequence_length, 128), dtype=np.float32)
        dec_inputs[f"past_key_values.{i}.value"] = np.zeros((batch_size, 8, past_sequence_length, 128), dtype=np.float32)
        
    past_sequence_length += dec_seq_len
    
    MAX_NEW_TOKENS = 4096
    
    # Let's decode
    for step in range(MAX_NEW_TOKENS):
        outputs = model.decoder.run(None, dec_inputs)
        logits = outputs[0] # [batch, seq_len, vocab_size]
        next_token_logits = logits[0, -1, :]
        next_token_id = int(np.argmax(next_token_logits))
        
        if next_token_id == 2: # EOS
            break
            
        generated_tokens.append(next_token_id)
        
        # Prepare next step inputs
        next_input_ids = np.array([[next_token_id]], dtype=np.int64)
        next_inputs_embeds = model.embed_tokens.run(None, {"input_ids": next_input_ids})[0]
        
        dec_inputs = {
            "inputs_embeds": next_inputs_embeds,
            "attention_mask": np.ones((batch_size, past_sequence_length + 1), dtype=np.int64)
        }
        for i in range(26):
            dec_inputs[f"past_key_values.{i}.key"] = outputs[i*2 + 1]
            dec_inputs[f"past_key_values.{i}.value"] = outputs[i*2 + 2]
            
        past_sequence_length += 1
        
    transcription = model.tokenizer.decode(generated_tokens, skip_special_tokens=True)
    return transcription
