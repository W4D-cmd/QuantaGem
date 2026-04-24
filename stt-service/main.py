import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
from typing import Any, Optional

import torch
from qwen_asr import Qwen3ASRModel
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse

app = FastAPI()

# Use Qwen3-ASR-1.7B as default
MODEL_NAME = os.getenv("MODEL_NAME", "Qwen/Qwen3-ASR-1.7B")
# Number of CPU threads for PyTorch inference (default: auto-detect)
STT_THREADS = int(os.getenv("STT_THREADS", "0")) or None
SAMPLE_RATE = 16000

model: Optional[Any] = None
model_loaded_event = threading.Event()


def load_asr_model():
    """Load the PyTorch ASR model."""
    global model
    start_time = time.time()
    print(f"STT: Loading model '{MODEL_NAME}' on CPU...")
    try:
        # Configure PyTorch CPU threads
        if STT_THREADS:
            torch.set_num_threads(STT_THREADS)
            print(f"STT: Using {STT_THREADS} CPU thread(s)")
        
        # Load the Qwen3-ASR model onto CPU
        model = Qwen3ASRModel.from_pretrained(
            MODEL_NAME,
            dtype=torch.float32,
            device_map="cpu"
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
    if not model_loaded_event.is_set() or model is None:
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

        # Transcribe using qwen-asr
        results = model.transcribe(audio=temp_wav_path)

        # Extract transcription from results list
        transcription = ""
        if results and len(results) > 0:
            if hasattr(results[0], 'text'):
                transcription = results[0].text
            else:
                transcription = str(results[0])

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
