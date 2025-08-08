# Start from the official pandoc/latex image
# This image already contains Pandoc and a TeX distribution
FROM pandoc/latex:3.7-ubuntu

# Set the working directory inside the container
WORKDIR /app

# Install Node.js using Volta
# pandoc/latex is usually based on Debian/Ubuntu, so apt-get is available,
# but Volta is also a valid method for managing Node versions.
# We install bash as Volta script often assumes it exists
RUN apt-get update && apt-get install -y --no-install-recommends bash curl texlive-fonts-recommended texlive-latex-recommended texlive-latex-extra && rm -rf /var/lib/apt/lists/*
RUN curl https://get.volta.sh | bash
ENV VOLTA_HOME=/root/.volta
ENV PATH="${VOLTA_HOME}/bin:${PATH}"
RUN volta install node@22

# Install pnpm globally
RUN npm install -g pnpm

# --- NEW: Install missing LaTeX packages ---
  RUN tlmgr update --self && \
  tlmgr install enumitem titlesec # Add any other missing packages here

# Copy root package.json and pnpm-workspace.yaml
COPY package.json ./
COPY pnpm-workspace.yaml ./

# Copy package.json files for all workspaces
COPY packages/pandoc-latex/package.json ./packages/pandoc-latex/

# Install dependencies using pnpm
RUN pnpm install

# Copy source files that are part of this workspace
COPY packages/pandoc-latex/src ./packages/pandoc-latex/src

# Set the working directory to the workspace directory inside the container
WORKDIR /app/packages/pandoc-latex

# Expose the port your Fastify server will listen on (e.g., 3000)
EXPOSE 80

# Define the command to run when the container starts.
# This will start your Fastify server using Node.js with the experimental flag.
# Ensure 'server.ts' matches the copied filename.
ENTRYPOINT ["node", "--experimental-transform-types", "src/server.ts"]