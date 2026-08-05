FROM python:3.14-slim-bookworm@sha256:f54824948519b8cdb0f94ed59db98c1388b39a7c945963d91f3e2ebe89b1d122

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
