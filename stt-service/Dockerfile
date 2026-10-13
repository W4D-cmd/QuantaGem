FROM python:3.15-slim-bookworm@sha256:edb77704c22e427c61cd6644d21b8472a330b641324798ae4472f26d68a23219

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    curl \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 50800

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "50800"]
