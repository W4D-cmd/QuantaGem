import logging
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.responses import PlainTextResponse
from faster_whisper import WhisperModel
import tempfile
import os
import threading
import time


app = FastAPI()

model_size = "medium"
compute_type = "int8"

model: Optional[WhisperModel] = None
model_loaded_event = threading.Event()

model_dir = os.getenv("WHISPER_MODEL_DIR", "./models")

def load_whisper_model():
    global model
    start_time = time.time()
    print(f"STT: Attempting to load Whisper model '{model_size}' from '{model_dir}'...")
    try:
        model = WhisperModel(model_size, device="cpu", compute_type=compute_type, download_root=model_dir)
        load_duration = time.time() - start_time
        print(f"STT: Whisper model loaded successfully in {load_duration:.2f} seconds.")
        model_loaded_event.set()
    except Exception as e:
        print(f"STT: Error loading Whisper model: {e}")
        pass

class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "HTTP/1.1" not in record.getMessage()

@app.on_event("startup")
async def startup_event():
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.addFilter(HealthCheckFilter())
    threading.Thread(target=load_whisper_model, daemon=True).start()

@app.post("/transcribe", response_class=PlainTextResponse)
async def transcribe_audio(audio_file: UploadFile = File(...)):
    if not model_loaded_event.is_set() or model is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Service unavailable: Whisper model is still loading or failed to load.")

    if not audio_file.content_type.startswith("audio/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only audio files are allowed.")

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{audio_file.filename.split('.')[-1]}") as temp_audio:
            temp_audio.write(await audio_file.read())
            temp_audio_path = temp_audio.name

        segments, info = model.transcribe(temp_audio_path, beam_size=5)

        transcription = ""
        for segment in segments:
            transcription += segment.text

        return transcription.strip()
    except Exception as e:
        print(f"STT: Transcription failed: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Transcription failed: {e}")
    finally:
        if 'temp_audio_path' in locals() and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

@app.get("/ping")
async def ping():
    if model_loaded_event.is_set():
        return {"status": "ok", "model_loaded": True}
    else:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model is still loading.")
