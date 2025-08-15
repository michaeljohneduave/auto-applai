#!/bin/bash

# Backup script for Auto-Apply application
# This script creates a backup of the SQLite database and uploads it to Google Cloud Storage

set -e

# Configuration
BACKUP_DIR="/app/backups"
LOG_DIR="/app/logs"
DATABASE_PATH="/app/data/sqlite.db"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
BUCKET_NAME=${GOOGLE_CLOUD_STORAGE_BUCKET}
PROJECT_ID=${GOOGLE_CLOUD_PROJECT}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$LOG_DIR"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="auto-apply-backup-${TIMESTAMP}.sql.gz"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
LOG_FILE="$LOG_DIR/backup-${TIMESTAMP}.log"

# Log function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting backup process..."

# Check if database exists
if [ ! -f "$DATABASE_PATH" ]; then
    log "ERROR: Database file not found at $DATABASE_PATH"
    exit 1
fi

# Create backup
log "Creating database backup..."
sqlite3 "$DATABASE_PATH" ".dump" | gzip > "$BACKUP_PATH"

# Check if backup was created successfully
if [ ! -f "$BACKUP_PATH" ]; then
    log "ERROR: Failed to create backup file"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
log "Backup created successfully: $BACKUP_NAME ($BACKUP_SIZE)"

# Upload to Google Cloud Storage
log "Uploading backup to Google Cloud Storage..."
gsutil cp "$BACKUP_PATH" "gs://$BUCKET_NAME/"

if [ $? -eq 0 ]; then
    log "Backup uploaded successfully to gs://$BUCKET_NAME/$BACKUP_NAME"
else
    log "ERROR: Failed to upload backup to Google Cloud Storage"
    exit 1
fi

# Clean up old local backups (keep last 5)
log "Cleaning up old local backups..."
cd "$BACKUP_DIR"
ls -t *.sql.gz | tail -n +6 | xargs -r rm -f

# Clean up old remote backups
log "Cleaning up old remote backups (older than $RETENTION_DAYS days)..."
gsutil ls "gs://$BUCKET_NAME/auto-apply-backup-*.sql.gz" | while read -r file; do
    # Extract date from filename and check if it's older than retention period
    filename=$(basename "$file")
    filedate=$(echo "$filename" | sed 's/auto-apply-backup-\([0-9]\{8\}\)_.*/\1/')
    
    if [ -n "$filedate" ]; then
        filedate_epoch=$(date -d "$filedate" +%s 2>/dev/null || echo "0")
        current_epoch=$(date +%s)
        days_old=$(( (current_epoch - filedate_epoch) / 86400 ))
        
        if [ $days_old -gt $RETENTION_DAYS ]; then
            log "Deleting old backup: $filename (${days_old} days old)"
            gsutil rm "$file"
        fi
    fi
done

log "Backup process completed successfully"

# Clean up local backup file
rm -f "$BACKUP_PATH"

log "Local backup file cleaned up"
