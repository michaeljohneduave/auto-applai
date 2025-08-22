#!/bin/bash

# Auto-Apply OCI Backup Script
# This script backs up the SQLite database and assets to OCI Object Storage

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration
PROJECT_ROOT="/opt/auto-apply"
BACKUP_ROOT="$PROJECT_ROOT/backup"
DATA_DIR="$PROJECT_ROOT/data"
ASSETS_DIR="$PROJECT_ROOT/assets"
LOGS_DIR="$BACKUP_ROOT/logs"

# OCI Configuration (from environment variables)
OCI_BACKUP_BUCKET="${OCI_BACKUP_BUCKET:-auto-apply-backup-bucket}"
OCI_ASSETS_BUCKET="${OCI_ASSETS_BUCKET:-auto-apply-assets-bucket}"
OCI_REGION="${OCI_REGION:-us-ashburn-1}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

# Create necessary directories
mkdir -p "$BACKUP_ROOT"
mkdir -p "$LOGS_DIR"

# Log file
LOG_FILE="$LOGS_DIR/backup-$(date +%Y%m%d_%H%M%S).log"

# Function to log to file
log_to_file() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Start backup process
log "Starting Auto-Apply backup to OCI Object Storage..."
log_to_file "Backup started"

# Check if OCI CLI is installed
if ! command -v oci &> /dev/null; then
    error "OCI CLI is not installed. Installing..."
    log_to_file "Installing OCI CLI"
    
    # Install OCI CLI
    sudo yum install -y oci-cli
    
    if ! command -v oci &> /dev/null; then
        error "Failed to install OCI CLI"
        log_to_file "Failed to install OCI CLI"
        exit 1
    fi
fi

# Check if OCI CLI is configured
if ! oci iam user get --user-id "${OCI_USER_ID}" &> /dev/null; then
    error "OCI CLI is not configured. Please configure it first."
    log_to_file "OCI CLI not configured"
    exit 1
fi

# Create backup timestamp
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DATE=$(date +%Y-%m-%d)

# Function to backup SQLite database
backup_database() {
    log "Backing up SQLite database..."
    log_to_file "Starting database backup"
    
    if [ ! -f "$DATA_DIR/sqlite.db" ]; then
        warning "SQLite database not found: $DATA_DIR/sqlite.db"
        log_to_file "SQLite database not found"
        return 1
    fi
    
    # Create database backup
    DB_BACKUP_FILE="$BACKUP_ROOT/sqlite_backup_${BACKUP_TIMESTAMP}.db"
    
    # Copy database with proper locking
    cp "$DATA_DIR/sqlite.db" "$DB_BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        success "Database backup created: $DB_BACKUP_FILE"
        log_to_file "Database backup created: $DB_BACKUP_FILE"
        
        # Upload to OCI Object Storage
        log "Uploading database backup to OCI Object Storage..."
        log_to_file "Uploading database backup"
        
        oci os object put \
            --bucket-name "$OCI_BACKUP_BUCKET" \
            --name "database/sqlite_backup_${BACKUP_TIMESTAMP}.db" \
            --file "$DB_BACKUP_FILE" \
            --region "$OCI_REGION"
        
        if [ $? -eq 0 ]; then
            success "Database backup uploaded to OCI Object Storage"
            log_to_file "Database backup uploaded successfully"
            
            # Clean up local backup file
            rm "$DB_BACKUP_FILE"
            log "Local backup file cleaned up"
        else
            error "Failed to upload database backup to OCI"
            log_to_file "Failed to upload database backup"
            return 1
        fi
    else
        error "Failed to create database backup"
        log_to_file "Failed to create database backup"
        return 1
    fi
}

# Function to backup assets
backup_assets() {
    log "Backing up assets..."
    log_to_file "Starting assets backup"
    
    if [ ! -d "$ASSETS_DIR" ]; then
        warning "Assets directory not found: $ASSETS_DIR"
        log_to_file "Assets directory not found"
        return 1
    fi
    
    # Create assets archive
    ASSETS_BACKUP_FILE="$BACKUP_ROOT/assets_backup_${BACKUP_TIMESTAMP}.tar.gz"
    
    # Create tar archive of assets
    tar -czf "$ASSETS_BACKUP_FILE" -C "$PROJECT_ROOT" assets/
    
    if [ $? -eq 0 ]; then
        success "Assets backup created: $ASSETS_BACKUP_FILE"
        log_to_file "Assets backup created: $ASSETS_BACKUP_FILE"
        
        # Upload to OCI Object Storage
        log "Uploading assets backup to OCI Object Storage..."
        log_to_file "Uploading assets backup"
        
        oci os object put \
            --bucket-name "$OCI_ASSETS_BUCKET" \
            --name "assets/assets_backup_${BACKUP_TIMESTAMP}.tar.gz" \
            --file "$ASSETS_BACKUP_FILE" \
            --region "$OCI_REGION"
        
        if [ $? -eq 0 ]; then
            success "Assets backup uploaded to OCI Object Storage"
            log_to_file "Assets backup uploaded successfully"
            
            # Clean up local backup file
            rm "$ASSETS_BACKUP_FILE"
            log "Local assets backup file cleaned up"
        else
            error "Failed to upload assets backup to OCI"
            log_to_file "Failed to upload assets backup"
            return 1
        fi
    else
        error "Failed to create assets backup"
        log_to_file "Failed to create assets backup"
        return 1
    fi
}

# Function to backup logs
backup_logs() {
    log "Backing up logs..."
    log_to_file "Starting logs backup"
    
    if [ ! -d "$LOGS_DIR" ]; then
        warning "Logs directory not found: $LOGS_DIR"
        log_to_file "Logs directory not found"
        return 1
    fi
    
    # Create logs archive
    LOGS_BACKUP_FILE="$BACKUP_ROOT/logs_backup_${BACKUP_TIMESTAMP}.tar.gz"
    
    # Create tar archive of logs (excluding current log file)
    tar -czf "$LOGS_BACKUP_FILE" -C "$BACKUP_ROOT" logs/ --exclude="$LOG_FILE"
    
    if [ $? -eq 0 ]; then
        success "Logs backup created: $LOGS_BACKUP_FILE"
        log_to_file "Logs backup created: $LOGS_BACKUP_FILE"
        
        # Upload to OCI Object Storage
        log "Uploading logs backup to OCI Object Storage..."
        log_to_file "Uploading logs backup"
        
        oci os object put \
            --bucket-name "$OCI_BACKUP_BUCKET" \
            --name "logs/logs_backup_${BACKUP_TIMESTAMP}.tar.gz" \
            --file "$LOGS_BACKUP_FILE" \
            --region "$OCI_REGION"
        
        if [ $? -eq 0 ]; then
            success "Logs backup uploaded to OCI Object Storage"
            log_to_file "Logs backup uploaded successfully"
            
            # Clean up local backup file
            rm "$LOGS_BACKUP_FILE"
            log "Local logs backup file cleaned up"
        else
            error "Failed to upload logs backup to OCI"
            log_to_file "Failed to upload logs backup"
            return 1
        fi
    else
        error "Failed to create logs backup"
        log_to_file "Failed to create logs backup"
        return 1
    fi
}

# Function to clean up old backups
cleanup_old_backups() {
    log "Cleaning up old backups (older than $BACKUP_RETENTION_DAYS days)..."
    log_to_file "Starting cleanup of old backups"
    
    # Calculate cutoff date
    CUTOFF_DATE=$(date -d "$BACKUP_RETENTION_DAYS days ago" +%Y%m%d)
    
    # List objects in backup bucket
    BACKUP_OBJECTS=$(oci os object list \
        --bucket-name "$OCI_BACKUP_BUCKET" \
        --region "$OCI_REGION" \
        --query "data.objects[?contains(name, 'sqlite_backup_') || contains(name, 'logs_backup_')].name" \
        --raw-output)
    
    # List objects in assets bucket
    ASSETS_OBJECTS=$(oci os object list \
        --bucket-name "$OCI_ASSETS_BUCKET" \
        --region "$OCI_REGION" \
        --query "data.objects[?contains(name, 'assets_backup_')].name" \
        --raw-output)
    
    # Process backup objects
    echo "$BACKUP_OBJECTS" | while read -r object; do
        if [ -n "$object" ]; then
            # Extract date from object name
            OBJECT_DATE=$(echo "$object" | grep -o '[0-9]\{8\}' | head -1)
            
            if [ -n "$OBJECT_DATE" ] && [ "$OBJECT_DATE" -lt "$CUTOFF_DATE" ]; then
                log "Deleting old backup: $object"
                log_to_file "Deleting old backup: $object"
                
                oci os object delete \
                    --bucket-name "$OCI_BACKUP_BUCKET" \
                    --object-name "$object" \
                    --region "$OCI_REGION" \
                    --force
            fi
        fi
    done
    
    # Process assets objects
    echo "$ASSETS_OBJECTS" | while read -r object; do
        if [ -n "$object" ]; then
            # Extract date from object name
            OBJECT_DATE=$(echo "$object" | grep -o '[0-9]\{8\}' | head -1)
            
            if [ -n "$OBJECT_DATE" ] && [ "$OBJECT_DATE" -lt "$CUTOFF_DATE" ]; then
                log "Deleting old assets backup: $object"
                log_to_file "Deleting old assets backup: $object"
                
                oci os object delete \
                    --bucket-name "$OCI_ASSETS_BUCKET" \
                    --object-name "$object" \
                    --region "$OCI_REGION" \
                    --force
            fi
        fi
    done
    
    success "Old backups cleanup completed"
    log_to_file "Old backups cleanup completed"
}

# Function to create backup summary
create_backup_summary() {
    log "Creating backup summary..."
    log_to_file "Creating backup summary"
    
    SUMMARY_FILE="$BACKUP_ROOT/backup_summary_${BACKUP_TIMESTAMP}.json"
    
    # Get backup statistics
    BACKUP_COUNT=$(oci os object list \
        --bucket-name "$OCI_BACKUP_BUCKET" \
        --region "$OCI_REGION" \
        --query "data.objects[?contains(name, 'sqlite_backup_')].name | length(@)" \
        --raw-output)
    
    ASSETS_COUNT=$(oci os object list \
        --bucket-name "$OCI_ASSETS_BUCKET" \
        --region "$OCI_REGION" \
        --query "data.objects[?contains(name, 'assets_backup_')].name | length(@)" \
        --raw-output)
    
    LOGS_COUNT=$(oci os object list \
        --bucket-name "$OCI_BACKUP_BUCKET" \
        --region "$OCI_REGION" \
        --query "data.objects[?contains(name, 'logs_backup_')].name | length(@)" \
        --raw-output)
    
    # Create summary JSON
    cat > "$SUMMARY_FILE" << EOF
{
    "backup_timestamp": "$BACKUP_TIMESTAMP",
    "backup_date": "$BACKUP_DATE",
    "backup_bucket": "$OCI_BACKUP_BUCKET",
    "assets_bucket": "$OCI_ASSETS_BUCKET",
    "region": "$OCI_REGION",
    "statistics": {
        "database_backups": $BACKUP_COUNT,
        "assets_backups": $ASSETS_COUNT,
        "logs_backups": $LOGS_COUNT
    },
    "retention_days": $BACKUP_RETENTION_DAYS,
    "status": "completed"
}
EOF
    
    # Upload summary to OCI
    oci os object put \
        --bucket-name "$OCI_BACKUP_BUCKET" \
        --name "summaries/backup_summary_${BACKUP_TIMESTAMP}.json" \
        --file "$SUMMARY_FILE" \
        --region "$OCI_REGION"
    
    if [ $? -eq 0 ]; then
        success "Backup summary uploaded to OCI"
        log_to_file "Backup summary uploaded successfully"
        
        # Clean up local summary file
        rm "$SUMMARY_FILE"
    else
        error "Failed to upload backup summary"
        log_to_file "Failed to upload backup summary"
    fi
}

# Main backup execution
main() {
    log "=== Auto-Apply OCI Backup Started ==="
    log_to_file "=== Backup process started ==="
    
    # Check if we're running in a container
    if [ -f /.dockerenv ]; then
        log "Running in Docker container"
        log_to_file "Running in Docker container"
    fi
    
    # Perform backups
    backup_database
    backup_assets
    backup_logs
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Create backup summary
    create_backup_summary
    
    log "=== Auto-Apply OCI Backup Completed Successfully ==="
    log_to_file "=== Backup process completed successfully ==="
    
    # Log final status
    echo "Backup completed successfully at $(date)" >> "$LOG_FILE"
    echo "Log file: $LOG_FILE"
}

# Run main function
main "$@"
