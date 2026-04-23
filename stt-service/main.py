import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
from typing import Any, Optional

import soundfile as sf
import numpy as np
from huggingface_hub import snapshot_download
from optimum.onnxruntime import ORTModelForSpeechSeq2Seq
from transformers import AutoProcessor
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse

app = FastAPI()

# Use built-in model name or custom HF repo ID
MODEL_NAME = os.getenv("MODEL_NAME", "onnx-community/cohere-transcribe-03-2026-ONNX")
# Hugging Face Access Token for gated repositories
HF_TOKEN = os.getenv("HF_TOKEN")
# Number of CPU threads for ONNX inference (default: auto-detect)
STT_THREADS = int(os.getenv("STT_THREADS", "0")) or None
SAMPLE_RATE = 16000

model: Optional[Any] = None
processor: Optional[Any] = None
model_loaded_event = threading.Event()


def load_asr_model():
    """Load the ONNX ASR model."""
    global model, processor
    start_time = time.time()
    print(f"STT: Loading model '{MODEL_NAME}' (INT8 Quantized)...")
    try:
        cache_dir = os.getenv("HF_HOME", "/app/models")
        
        # Smart Download: Only fetch the config files and the INT8 quantized weights
        print("STT: Checking/downloading required model files...")
        
        # Check if MODEL_NAME is a local path or HF repo ID
        if os.path.exists(MODEL_NAME):
            model_path = MODEL_NAME
        else:
            model_path = snapshot_download(
                repo_id=MODEL_NAME,
                cache_dir=cache_dir,
                token=HF_TOKEN,
                allow_patterns=[
                    "*.json", # Gets config.json, tokenizer.json, preprocessor_config.json, etc.
                    "onnx/*_quantized.onnx*", # Gets only the INT8 model and data files
                ]
            )
            
            # Download the required custom processing classes from the base model
            print("STT: Downloading custom processing classes from base model...")
            base_model_path = snapshot_download(
                repo_id="CohereLabs/cohere-transcribe-03-2026",
                cache_dir=cache_dir,
                token=HF_TOKEN,
                allow_patterns=["*.py"]
            )
            # Copy Python files to the ONNX model path so AutoProcessor can find them
            for filename in os.listdir(base_model_path):
                if filename.endswith(".py"):
                    shutil.copy2(os.path.join(base_model_path, filename), model_path)

        # Configure ONNX Runtime session options
        import onnxruntime as ort
        sess_options = ort.SessionOptions()
        if STT_THREADS:
            sess_options.intra_op_num_threads = STT_THREADS
            sess_options.inter_op_num_threads = 1
            print(f"STT: Using {STT_THREADS} CPU thread(s)")
        
        processor = AutoProcessor.from_pretrained(model_path, trust_remote_code=True)
        
        # Load the INT8 quantized model
        model = ORTModelForSpeechSeq2Seq.from_pretrained(
            model_path,
            encoder_file_name="onnx/encoder_model_quantized.onnx",
            decoder_file_name="onnx/decoder_model_merged_quantized.onnx",
            session_options=sess_options,
            trust_remote_code=True
        )
        
        load_duration = time.time() - start_time
        print(f"STT: Model loaded in {load_duration:.2f}s.")
        model_loaded_event.set()
    except Exception as e:
        print(f"STT: Error loading model: {e}")
        raise


class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "HTTP/1.1" not in record.getMessage()


@app.on_event("startup")
async def startup_event():
    logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())
    threading.Thread(target=load_asr_model, daemon=True).start()


def convert_audio_to_wav(input_path: str, output_path: str) -> None:
    """
    Convert audio file to 16kHz mono WAV format using ffmpeg.
    Supports all common audio formats (mp3, webm, m4a, ogg, flac, etc.)
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-ar", str(SAMPLE_RATE),
        "-ac", "1",
        "-f", "wav",
        "-acodec", "pcm_s16le",
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg conversion failed: {result.stderr}")


@app.post("/transcribe", response_class=PlainTextResponse)
async def transcribe_audio(audio_file: UploadFile = File(...)):
    if not model_loaded_event.is_set() or model is None or processor is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model loading."
        )

    # Save uploaded file to temp
    suffix = os.path.splitext(audio_file.filename)[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_input:
        shutil.copyfileobj(audio_file.file, temp_input)
        temp_input_path = temp_input.name

    # Prepare path for conversion
    temp_wav_path = tempfile.mktemp(suffix=".wav")

    try:
        # Convert to 16kHz mono WAV
        convert_audio_to_wav(temp_input_path, temp_wav_path)

        # Read audio array using soundfile
        audio_data, sr = sf.read(temp_wav_path)
        if sr != SAMPLE_RATE:
            raise ValueError(f"Unexpected sample rate: {sr}")

        # Process audio inputs
        inputs = processor(audio_data, sampling_rate=SAMPLE_RATE, return_tensors="pt")

        # Generate transcription (defaulting to English for this model)
        generated_ids = model.generate(
            inputs.input_features, 
            max_new_tokens=1024,
            language="en"
        )
        
        # Decode tokens
        transcription = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

        return transcription.strip() if transcription else ""

    except Exception as e:
        print(f"STT: Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        for path in [temp_input_path, temp_wav_path]:
            if os.path.exists(path):
                os.remove(path)


@app.get("/ping")
async def ping():
    if model_loaded_event.is_set():
        return {"status": "ok"}
    raise HTTPException(status_code=503)