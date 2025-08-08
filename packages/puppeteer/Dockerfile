# Use an official Node.js runtime as a parent image
FROM node:22.16-slim

# Set the working directory in the container
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Install dependencies for Puppeteer (Chromium), Xvfb, PulseAudio, and FFmpeg
# This is the most critical part. These are the libraries Chromium needs to run.
RUN apt-get update && apt-get install -y \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    xvfb \
    pulseaudio \
    ffmpeg \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy root package.json and pnpm-workspace.yaml
COPY package.json ./
COPY pnpm-workspace.yaml ./

# Copy package.json files for all workspaces
COPY packages/puppeteer/package.json ./packages/puppeteer/

# Install dependencies using pnpm
RUN pnpm install

# Bundle app source
COPY packages/puppeteer/src/ ./packages/puppeteer/src/

WORKDIR /app/packages/puppeteer

# Expose the port the app runs on
EXPOSE 80

ENTRYPOINT ["node", "--experimental-transform-types", "src/server.ts"]