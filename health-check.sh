#!/bin/bash

# Auto-Apply Health Check Script
# This script checks the health of all API services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
API_URL="http://localhost:8080"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
EMAIL="${ADMIN_EMAIL:-}"

log "Starting health check..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    error "Docker is not running"
    exit 1
fi

# Check service status
log "Checking Docker service status..."
if docker-compose -f docker-compose.prod.yml ps | grep -q "unhealthy"; then
    error "Some services are unhealthy"
    docker-compose -f docker-compose.prod.yml ps
    exit 1
fi

# Check API health endpoint
log "Checking API health endpoint..."
if curl -f "$API_URL/health" > /dev/null 2>&1; then
    success "API health check passed"
else
    error "API health check failed"
    
    # Send notification
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data '{"text":"🚨 Auto-Apply API health check failed!"}' \
            "$SLACK_WEBHOOK"
    fi
    
    # Attempt auto-restart
    log "Attempting auto-restart..."
    docker-compose -f docker-compose.prod.yml restart api
    
    sleep 30
    
    # Check again
    if curl -f "$API_URL/health" > /dev/null 2>&1; then
        success "Auto-restart successful"
        exit 0
    else
        error "Auto-restart failed"
        exit 1
    fi
fi

# Check resource usage
log "Checking resource usage..."
TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
USED_MEM=$(free -m | awk 'NR==2{printf "%.0f", $3}')
MEM_USAGE=$((USED_MEM * 100 / TOTAL_MEM))

if [ $MEM_USAGE -gt 90 ]; then
    warning "High memory usage: ${MEM_USAGE}%"
    
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"⚠️ Auto-Apply high memory usage: ${MEM_USAGE}%\"}" \
            "$SLACK_WEBHOOK"
    fi
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 90 ]; then
    warning "High disk usage: ${DISK_USAGE}%"
    
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"⚠️ Auto-Apply high disk usage: ${DISK_USAGE}%\"}" \
            "$SLACK_WEBHOOK"
    fi
fi

success "Health check completed successfully"
log "Memory usage: ${MEM_USAGE}%"
log "Disk usage: ${DISK_USAGE}%"
