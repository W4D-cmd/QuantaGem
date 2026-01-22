import logging
import base64
import tempfile
import os
import threading
import time
import asyncio
import gc
import platform
import ctypes
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

# Docling Imports
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, AcceleratorOptions

app = FastAPI()

converter: Optional[DocumentConverter] = None
converter_loaded_event = threading.Event()

def release_memory():
    """Zwingt Python und das OS, Speicher freizugeben."""
    gc.collect()
    if platform.system() == "Linux":
        try:
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        except Exception:
            pass

class PDFConvertRequest(BaseModel):
    file_data: str  # base64 encoded PDF
    filename: Optional[str] = "document.pdf"


def load_docling_converter():
    global converter
    start_time = time.time()
    print("Docling: Initializing DocumentConverter with 4 CPU threads...")
    try:
        pipeline_options = PdfPipelineOptions()
        
        pipeline_options.accelerator_options = AcceleratorOptions(
            num_threads=4, 
            device="cpu"
        )

        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )
        
        load_duration = time.time() - start_time
        print(f"Docling: DocumentConverter initialized in {load_duration:.2f}s.")
        converter_loaded_event.set()
    except Exception as e:
        print(f"Docling: Error initializing converter: {e}")


class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "HTTP/1.1" not in record.getMessage()


@app.on_event("startup")
async def startup_event():
    logging.getLogger("uvicorn.access").addFilter(HealthCheckFilter())
    threading.Thread(target=load_docling_converter, daemon=True).start()


@app.post("/convert", response_class=PlainTextResponse)
async def convert_pdf_to_markdown(request: PDFConvertRequest):
    """Convert a PDF file to markdown text."""
    if not converter_loaded_event.is_set() or converter is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Docling converter is still loading.",
        )

    if not request.file_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="file_data (base64 encoded PDF) is required.",
        )

    try:
        pdf_bytes = base64.b64decode(request.file_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 encoding: {str(e)}",
        )

    temp_pdf_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(pdf_bytes)
            temp_pdf_path = temp_pdf.name

        # Run blocking Docling conversion in thread pool
        def do_conversion():
            result = converter.convert(temp_pdf_path)
            markdown_output = result.document.export_to_markdown()
            
            del result
            
            release_memory()
            
            return markdown_output

        markdown_content = await asyncio.to_thread(do_conversion)

        return markdown_content

    except Exception as e:
        print(f"Docling: Conversion failed: {e}")
        release_memory()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF conversion failed: {str(e)}",
        )
    finally:
        if temp_pdf_path and os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)


@app.get("/ping")
async def ping():
    """Health check endpoint."""
    if converter_loaded_event.is_set():
        return {"status": "ok"}
    raise HTTPException(status_code=503, detail="Converter not ready")
