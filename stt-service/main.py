import logging
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.responses import PlainTextResponse
from faster_whisper import WhisperModel
import tempfile
import os
import threading
import time
import shutil

app = FastAPI()

MODEL_SIZE = "Systran/faster-whisper-large-v3" 
COMPUTE_TYPE = "int8"
CPU_THREADS = 14 

model: Optional[WhisperModel] = None
model_loaded_event = threading.Event()
model_dir = os.getenv("WHISPER_MODEL_DIR", "./models")

def load_whisper_model():
    global model
    start_time = time.time()
    print(f"STT: Loading Whisper model '{MODEL_SIZE}'...")
    try:
        model = WhisperModel(
            MODEL_SIZE, 
            device="cpu", 
            compute_type=COMPUTE_TYPE, 
            download_root=model_dir,
            cpu_threads=CPU_THREADS,
            num_workers=1
        )
        load_duration = time.time() - start_time
        print(f"STT: Loaded in {load_duration:.2f}s.")
        model_loaded_event.set()
    except Exception as e:
        print(f"STT: Error loading model: {e}")

class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "HTTP/1.1" not in record.getMessage()

@app.on_event("startup")
async def startup_event():
    logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())
    threading.Thread(target=load_whisper_model, daemon=True).start()

@app.post("/transcribe", response_class=PlainTextResponse)
async def transcribe_audio(audio_file: UploadFile = File(...)):
    if not model_loaded_event.is_set() or model is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model loading.")

    suffix = os.path.splitext(audio_file.filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
        shutil.copyfileobj(audio_file.file, temp_audio)
        temp_audio_path = temp_audio.name

    try:
        segments, info = model.transcribe(
            temp_audio_path, 
            beam_size=1, 
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        text_segments = [segment.text for segment in segments]
        transcription = "".join(text_segments)

        return transcription.strip()
        
    except Exception as e:
        print(f"STT: Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

@app.get("/ping")
async def ping():
    if model_loaded_event.is_set():
        return {"status": "ok"}
    raise HTTPException(status_code=503)
