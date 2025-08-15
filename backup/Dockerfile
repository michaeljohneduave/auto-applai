# Use Python slim image for backup service
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    sqlite3 \
    gzip \
    tar \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install Google Cloud SDK
RUN curl -sSL https://sdk.cloud.google.com | bash
ENV PATH $PATH:/root/google-cloud-sdk/bin

# Copy backup scripts
COPY scripts/ ./scripts/

# Install Python dependencies
RUN pip install --no-cache-dir google-cloud-storage

# Make scripts executable
RUN chmod +x scripts/backup.sh scripts/restore.sh

# Create log directory
RUN mkdir -p /app/logs

# Set default command
CMD ["python", "scripts/backup_service.py"]
