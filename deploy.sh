#!/bin/bash

# Auto-Apply Production Deployment Script (API-Only)
# This script sets up and deploys the Auto-Apply API services to production
# Uses Bun runtime for better performance

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

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    error "Please do not run this script as root"
    exit 1
fi

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.production"
ENV_TEMPLATE="$PROJECT_ROOT/env.production.template"

log "Starting Auto-Apply API-only production deployment (Bun runtime)..."

# Check if .env.production exists
if [ ! -f "$ENV_FILE" ]; then
    error "Production environment file not found: $ENV_FILE"
    log "Please copy $ENV_TEMPLATE to $ENV_FILE and configure your environment variables"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
log "Creating necessary directories..."
mkdir -p "$PROJECT_ROOT/data"
mkdir -p "$PROJECT_ROOT/assets"
mkdir -p "$PROJECT_ROOT/backup/logs"

# Set proper permissions for SQLite database
log "Setting proper permissions..."
chmod 755 "$PROJECT_ROOT/data"
chmod 755 "$PROJECT_ROOT/assets"
chmod 644 "$PROJECT_ROOT/data/sqlite.db" 2>/dev/null || true

# Load environment variables
log "Loading environment variables..."
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Validate required environment variables
required_vars=(
    "CLERK_SECRET_KEY"
    "CLERK_PUBLISHABLE_KEY"
    "OPENAI_API_KEY"
    "GEMINI_API_KEY"
    "GOOGLE_CLOUD_PROJECT"
    "GOOGLE_CLOUD_STORAGE_BUCKET"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    error "Missing required environment variables: ${missing_vars[*]}"
    exit 1
fi

# Check system resources
log "Checking system resources..."
TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
USED_MEM=$(free -m | awk 'NR==2{printf "%.0f", $3}')
MEM_USAGE=$((USED_MEM * 100 / TOTAL_MEM))

log "Memory usage: ${MEM_USAGE}% (${USED_MEM}MB / ${TOTAL_MEM}MB)"

if [ $MEM_USAGE -gt 85 ]; then
    warning "High memory usage detected: ${MEM_USAGE}%"
    if [ "$AUTO_DEPLOY" != "true" ]; then
        read -p "Continue with deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Check disk space
DISK_USAGE=$(df / | awk 'NR==2{print $5}' | sed 's/%//')
log "Disk usage: ${DISK_USAGE}%"

if [ $DISK_USAGE -gt 90 ]; then
    warning "High disk usage detected: ${DISK_USAGE}%"
    if [ "$AUTO_DEPLOY" != "true" ]; then
        read -p "Continue with deployment? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Create pre-deployment backup
log "Creating pre-deployment backup..."
if [ -f "$PROJECT_ROOT/data/sqlite.db" ]; then
    cp "$PROJECT_ROOT/data/sqlite.db" "$PROJECT_ROOT/data/sqlite.db.backup.$(date +%Y%m%d_%H%M%S)"
    success "Pre-deployment backup created"
fi

# Stop existing containers
log "Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down --remove-orphans --timeout 30 || true

# Clean up old images to save space
log "Cleaning up old Docker images..."
docker image prune -f

# Build and start services
log "Building and starting API services (Bun runtime)..."
docker-compose -f docker-compose.prod.yml up -d --build

# Wait for services to be healthy
log "Waiting for services to be healthy..."
timeout=300
elapsed=0
interval=10

while [ $elapsed -lt $timeout ]; do
    unhealthy_count=$(docker-compose -f docker-compose.prod.yml ps | grep -c "unhealthy" || true)
    
    if [ "$unhealthy_count" -eq 0 ]; then
        success "All API services are healthy!"
        break
    else
        warning "$unhealthy_count services still unhealthy, waiting..."
        sleep $interval
        elapsed=$((elapsed + interval))
    fi
done

if [ $elapsed -ge $timeout ]; then
    error "Timeout waiting for services to be healthy"
    log "Checking service logs..."
    docker-compose -f docker-compose.prod.yml logs --tail=50
    exit 1
fi

# Start backup service
log "Starting backup service..."
docker-compose -f docker-compose.prod.yml --profile backup up -d backup

# Run post-deployment tests
log "Running post-deployment tests..."
sleep 10

# Test API health endpoint
if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    success "API health check passed"
else
    error "API health check failed"
    exit 1
fi

# Show service status
log "Service status:"
docker-compose -f docker-compose.prod.yml ps

# Show resource usage
log "Resource usage:"
free -h
df -h /

# Show logs
log "Recent logs:"
docker-compose -f docker-compose.prod.yml logs --tail=20

success "API deployment completed successfully!"
log "Your Auto-Apply API is now running at:"
log "  - API: https://api.yourdomain.com"
log "  - Health check: https://api.yourdomain.com/health"
log ""
log "Frontend will be deployed separately to Cloudflare Pages"
log ""
log "Runtime: Bun (faster than Node.js)"
log "Database: SQLite (persistent in ./data/)"
log ""
log "To view logs: docker-compose -f docker-compose.prod.yml logs -f"
log "To stop services: docker-compose -f docker-compose.prod.yml down"
log "To restart services: docker-compose -f docker-compose.prod.yml restart"
