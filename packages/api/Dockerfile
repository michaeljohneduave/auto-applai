# Use Bun runtime as parent image
FROM oven/bun:1

# Set the working directory in the container
WORKDIR /app

# Install system dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm (standalone) and add to PATH
RUN curl -fsSL https://get.pnpm.io/install.sh | sh - && \
    /root/.local/share/pnpm/pnpm --version
ENV PATH="/root/.local/share/pnpm:${PATH}"

# Copy root manifests
COPY package.json ./
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./

# Copy package.json files for all workspaces
COPY packages/api/package.json ./packages/api/
COPY packages/core/package.json ./packages/core/
COPY packages/common/package.json ./packages/common/

# Install dependencies using pnpm (workspace-aware)
RUN pnpm install --frozen-lockfile

# Copy source files for all workspaces
COPY packages/api/src/ ./packages/api/src/
COPY packages/core/src/ ./packages/core/src/
COPY packages/common/src/ ./packages/common/src/

# Create data and assets directories for SQLite and file storage
RUN mkdir -p /app/data
RUN mkdir -p /app/assets/failed-scrapes

# Set API port for runtime and healthchecks
ENV API_PORT=8080

# Set the working directory to the API workspace
WORKDIR /app/packages/api

# Expose the port the app runs on (Cloud Run compatible)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${API_PORT}/health || exit 1

# Define the command to run when the container starts
CMD ["bun", "run", "start"]
