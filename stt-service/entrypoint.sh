#!/bin/sh
set -e

MODEL_NAME="${MODEL_NAME:-large-v3-turbo-q8_0}"
STT_THREADS="${STT_THREADS:-4}"
MODELS_DIR="${MODELS_DIR:-/models}"
MODEL_PATH="${MODELS_DIR}/ggml-${MODEL_NAME}.bin"
DOWNLOAD_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL_NAME}.bin"

if [ ! -f "$MODEL_PATH" ]; then
    echo "STT: Downloading model '${MODEL_NAME}'..."
    mkdir -p "$MODELS_DIR"
    curl -L --progress-bar -o "$MODEL_PATH" "$DOWNLOAD_URL"

    if [ ! -s "$MODEL_PATH" ]; then
        echo "STT: Error - model file is empty or missing after download" >&2
        exit 1
    fi
    echo "STT: Model downloaded successfully."
else
    echo "STT: Model '${MODEL_NAME}' already exists. Skipping download."
fi

echo "STT: Starting whisper-server (threads: ${STT_THREADS})..."
exec whisper-server \
    --host 0.0.0.0 \
    --port 8000 \
    -m "$MODEL_PATH" \
    -t "$STT_THREADS" \
    --convert \
    --language auto \
    --no-timestamps
