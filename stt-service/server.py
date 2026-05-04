import asyncio
import numpy as np
import json
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from contextlib import asynccontextmanager
from model import get_model, download_model
from config import MODELS_DIR, VARIANT
from audio import load_audio
from inference import transcribe_batch
from streaming import StreamingTranscriber

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("STT Service: Downloading/verifying model...")
    download_model(MODELS_DIR, VARIANT)
    
    print("STT Service: Loading ONNX sessions...")
    app.state.model = get_model()
    
    print("STT Service: Running initialization diagnostic...")
    app.state.model.inspect_model_io()
    
    print("STT Service: Ready!")
    yield
    print("STT Service: Shutting down.")

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": hasattr(app.state, "model")}

@app.post("/inference")
async def inference(file: UploadFile = File(...), response_format: str = Form("json")):
    try:
        audio_bytes = await file.read()
        audio = load_audio(audio_bytes, file.filename)
        
        transcription = transcribe_batch(app.state.model, audio)
        
        if response_format == "text":
            return PlainTextResponse(transcription)
        return {"text": transcription}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/stream")
async def stream(request: Request):
    transcriber = StreamingTranscriber(app.state.model)
    
    async def process_updates():
        # Start the audio processing as a task within the generator scope
        async def process_audio():
            buffer = b''
            try:
                async for chunk in request.stream():
                    if not chunk:
                        continue
                    buffer += chunk
                    
                    # Process chunks that are multiples of 4 bytes (float32)
                    valid_len = (len(buffer) // 4) * 4
                    if valid_len > 0:
                        pcm_chunk = np.frombuffer(buffer[:valid_len], dtype=np.float32)
                        await transcriber.add_audio_chunk(pcm_chunk)
                        buffer = buffer[valid_len:]
            except Exception as e:
                print(f"STT Service: Error reading stream: {e}")
            finally:
                transcriber.stop()

        audio_task = asyncio.create_task(process_audio())
        
        try:
            async for text_update in transcriber.get_transcription_updates():
                print(f"STT Service: Yielding token: {text_update}")
                yield f'data: {json.dumps({"type": "text", "value": text_update})}\n\n'
            
            final_text = transcriber.tokenizer.decode(transcriber.token_cache, skip_special_tokens=True)
            yield f'data: {json.dumps({"type": "done", "text": final_text})}\n\n'
        except Exception as e:
            print(f"STT Service: Error in updates: {e}")
            yield f'data: {json.dumps({"type": "error", "value": str(e)})}\n\n'
            transcriber.stop()
        finally:
            if not audio_task.done():
                audio_task.cancel()
            
    return StreamingResponse(process_updates(), media_type="text/event-stream")

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    return await inference(file=file)