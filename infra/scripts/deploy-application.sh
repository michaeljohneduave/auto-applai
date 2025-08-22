set -euo pipefail

echo "Starting application deployment in ${DEPLOYMENT_MODE} mode..."

ROOT_DIR="/opt/auto-apply"
APP_DIR="/home/ubuntu/auto-apply"

handle_git_deployment() {
  local repo_url="${REPO}"
  local target_dir="$APP_DIR"

  echo "=== GIT DEPLOYMENT MODE ==="
  echo "Checking repository status at $target_dir"

  # Ensure directory exists and is owned by ubuntu BEFORE git operations
  sudo mkdir -p "$target_dir"
  sudo chown -R ubuntu:ubuntu "$target_dir"

  if [ -d "$target_dir/.git" ]; then
    echo "Repository already exists, updating..."
    cd "$target_dir"
    if ! git diff --quiet || ! git diff --cached --quiet; then
      echo "Stashing local changes..."
      git stash push -m "Auto-stash before pull $(date)"
    fi
    echo "Fetching latest changes..."
    git fetch --all --prune
    current_branch=$(git branch --show-current)
    echo "Current branch: $current_branch"
    git pull --ff-only origin "$current_branch" || git reset --hard "origin/$current_branch"
  else
    echo "Repository does not exist, initializing in subdirectory..."
    cd "$target_dir"
    git init
    git remote remove origin 2>/dev/null || true
    git remote add origin "$repo_url"
    if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
      DEFAULT_BRANCH=main
    elif git ls-remote --exit-code --heads origin master >/dev/null 2>&1; then
      DEFAULT_BRANCH=master
    else
      DEFAULT_BRANCH=$(git ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ {gsub("refs/heads/","", $2); print $2}')
    fi
    echo "Using branch: ${DEFAULT_BRANCH:-main}"
    git fetch --depth 1 origin ${DEFAULT_BRANCH:-main} || git fetch origin
    git checkout -B ${DEFAULT_BRANCH:-main} || true
    git reset --hard origin/${DEFAULT_BRANCH:-main} || true
    echo "Repository initialized successfully"
  fi

  if [ ! -d ".git" ]; then
    echo "Error: Not a git repository after setup"
    exit 1
  fi

  echo "Current commit: $(git rev-parse --short HEAD)"
  echo "Current branch: $(git branch --show-current)"

  COMPOSE_FILE="docker-compose.oci.yml"
  BUILD_FLAG="--build"
}

handle_registry_deployment() {
  local target_dir="$APP_DIR"
  local registry_url="${REGION}.ocir.io"
  local namespace_name=$(oci os ns get --query "data" --raw-output)
  local image_name="$registry_url/$namespace_name/${RESOURCE_PREFIX}/auto-apply"

  echo "=== REGISTRY DEPLOYMENT MODE ==="
  echo "Registry: $registry_url"
  echo "Image: $image_name"

  sudo mkdir -p "$target_dir"
  sudo chown -R ubuntu:ubuntu "$target_dir"
  cd "$target_dir"

  if [ ! -f "docker-compose.registry.yml" ]; then
    echo "Creating registry-based docker-compose file..."
    sudo tee docker-compose.registry.yml >/dev/null <<EOF
version: '3.8'
services:
  auto-apply:
    image: $image_name:latest
    ports:
      - "8080:8080"
    env_file:
      - .env
    volumes:
      - /opt/auto-apply/data:/app/data
      - /opt/auto-apply/assets:/app/assets
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
EOF
    sudo chown ubuntu:ubuntu docker-compose.registry.yml
  fi

  echo "Pulling latest image: $image_name:latest"
  if ! docker pull "$image_name:latest"; then
    echo "Failed to pull image. Falling back to git deployment..."
    handle_git_deployment
    return
  fi

  COMPOSE_FILE="docker-compose.registry.yml"
  BUILD_FLAG=""
}

if [ "${DEPLOYMENT_MODE}" = "registry" ]; then
  handle_registry_deployment
else
  handle_git_deployment
fi

# Ensure app and persistent directories exist and are owned by ubuntu
sudo mkdir -p "$ROOT_DIR/data" "$ROOT_DIR/assets" "$ROOT_DIR/backup" "$APP_DIR"
sudo chown -R ubuntu:ubuntu "$ROOT_DIR" "$APP_DIR"
cd "$APP_DIR"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: $COMPOSE_FILE not found"
  exit 1
fi

echo "Stopping existing containers..."
docker-compose -f "$COMPOSE_FILE" down || true

echo "Starting services with $COMPOSE_FILE..."
if [ -n "$BUILD_FLAG" ]; then
  echo "Building and starting services..."
  docker-compose -f "$COMPOSE_FILE" up -d $BUILD_FLAG
else
  echo "Starting services from registry images..."
  docker-compose -f "$COMPOSE_FILE" up -d
fi

echo "Waiting for services to start..."
sleep 15

echo "Checking service status..."
if ! docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
  echo "Warning: Some services may not be running properly"
  docker-compose -f "$COMPOSE_FILE" ps
else
  echo "All services appear to be running"
fi

echo "Application deployed successfully using $COMPOSE_FILE"


