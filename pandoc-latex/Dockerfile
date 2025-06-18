# Start from the official pandoc/latex image
# This image already contains Pandoc and a TeX distribution
FROM pandoc/latex:3.7-ubuntu

# Set the working directory inside the container
WORKDIR /app

# Install Node.js using Volta
# pandoc/latex is usually based on Debian/Ubuntu, so apt-get is available,
# but Volta is also a valid method for managing Node versions.
# We install bash as Volta script often assumes it exists
RUN apt-get update && apt-get install -y --no-install-recommends bash curl && rm -rf /var/lib/apt/lists/*
RUN curl https://get.volta.sh | bash
ENV VOLTA_HOME=/root/.volta
ENV PATH="${VOLTA_HOME}/bin:${PATH}"
RUN volta install node@22

# --- NEW: Install missing LaTeX packages ---
  RUN tlmgr update --self && \
  tlmgr install enumitem titlesec # Add any other missing packages here

# --- Workspace Setup Inside Docker ---
# Copy the root package.json (needed for npm to understand workspaces)
COPY package.json ./

# Copy the specific package.json for this workspace
COPY pandoc-latex/package.json ./pandoc-latex/

# Install dependencies using --workspace flag or just npm install
# Running npm install from the root workdir will install all dependencies,
# including the hoisted ones.
RUN npm install

# Copy source files that are part of this workspace
COPY pandoc-latex/src ./pandoc-latex/src

# Set the working directory to the workspace directory inside the container
WORKDIR /app/pandoc-latex
# --- End Workspace Setup ---

# Expose the port your Fastify server will listen on (e.g., 3000)
EXPOSE 80

# Define the command to run when the container starts.
# This will start your Fastify server using Node.js with the experimental flag.
# Ensure 'server.ts' matches the copied filename.
ENTRYPOINT ["node", "--experimental-transform-types", "src/server.ts"]