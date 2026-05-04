import io
import subprocess
import numpy as np
import librosa
import soundfile as sf
from config import SAMPLE_RATE, N_FFT, HOP_LENGTH, N_MELS, GLOBAL_LOG_MEL_MAX, WIN_LENGTH

def load_audio(audio_bytes: bytes, filename: str) -> np.ndarray:
    try:
        # Try to read directly using soundfile (works for wav, ogg, flac)
        audio, sr = sf.read(io.BytesIO(audio_bytes))
    except Exception:
        # Fallback to ffmpeg for other formats (like webm, mp3)
        process = subprocess.Popen([
            'ffmpeg', '-i', 'pipe:0',
            '-f', 'wav', '-acodec', 'pcm_f32le',
            '-ar', str(SAMPLE_RATE), '-ac', '1', 'pipe:1'
        ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        out, err = process.communicate(input=audio_bytes)
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg conversion failed: {err.decode('utf-8', errors='ignore')}")
            
        audio, sr = sf.read(io.BytesIO(out))

    # Convert to mono if stereo
    if len(audio.shape) > 1:
        audio = audio.mean(axis=1)

    # Resample if needed
    if sr != SAMPLE_RATE:
        audio = librosa.resample(y=audio, orig_sr=sr, target_sr=SAMPLE_RATE)
        
    return audio.astype(np.float32)

def compute_mel_spectrogram(audio: np.ndarray) -> np.ndarray:
    mel_filters = librosa.filters.mel(sr=SAMPLE_RATE, n_fft=N_FFT, n_mels=N_MELS)
    
    # In transformers, center=False is used for causal models without auto-padding in STFT
    stft = librosa.stft(
        y=audio,
        n_fft=N_FFT,
        hop_length=HOP_LENGTH,
        win_length=WIN_LENGTH,
        center=False
    )
    
    magnitudes = np.abs(stft) ** 2
    mel = np.dot(mel_filters, magnitudes)
    
    log_mel = np.log10(np.maximum(mel, 1e-10))
    log_mel = np.clip(log_mel / GLOBAL_LOG_MEL_MAX, -1.0, 1.0)
    
    return log_mel[np.newaxis, :, :].astype(np.float32)

def compute_mel_spectrogram_chunk(audio: np.ndarray, is_first: bool, processor_params: dict) -> np.ndarray:
    # Streaming variant
    if is_first:
        return compute_mel_spectrogram(audio)
        
    # For subsequent chunks, we just compute the mel spectrogram
    # The overlap windowing is handled by the caller who constructs the audio chunk
    return compute_mel_spectrogram(audio)
