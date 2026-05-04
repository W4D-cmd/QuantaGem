#!/bin/sh
set -e

MODELS_DIR="${MODELS_DIR:-/models}"
VARIANT="${VARIANT:-q4}"

echo "STT Service: Downloading model..."
python -c "from model import download_model; download_model('${MODELS_DIR}', '${VARIANT}')"

echo "STT Service: Starting uvicorn..."
exec uvicorn server:app --host 0.0.0.0 --port 8000 --workers 1 --timeout-keep-alive 600
