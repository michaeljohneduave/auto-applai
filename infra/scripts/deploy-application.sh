set -euo pipefail

# ==============================
# Configuration (hoisted vars)
# ==============================
# Persistent app data lives here
ROOT_DIR="/opt/auto-apply"
# Working copy for the application source
APP_DIR="/home/ubuntu/auto-apply"
# Compose file and flags (git mode)
COMPOSE_FILE="docker-compose.oci.yml"
BUILD_FLAG="--build"

echo "Starting application deployment (git mode)..."

handle_git_deployment() {
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
    if [ -z "${REPO:-}" ]; then
      echo "Error: REPO environment variable is not set and repository is not initialized."
      echo "       Set REPO to your git URL (e.g., https://github.com/owner/repo.git) and re-run."
      exit 1
    fi
    git init
    git remote remove origin 2>/dev/null || true
    git remote add origin "$REPO"
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
}

handle_git_deployment

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
echo "Building and starting services..."
docker-compose -f "$COMPOSE_FILE" up -d $BUILD_FLAG

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


