#!/bin/bash

# The name for your tmux session
SESSION_NAME="auto-apply"

# The root directory of your monorepo.
# Using $HOME is more robust than ~ in scripts.
MONOREPO_PATH="$HOME/code/auto-applai"

# Check if the session already exists. If so, attach to it.
tmux has-session -t $SESSION_NAME 2>/dev/null
if [ $? == 0 ]; then
    echo "Session $SESSION_NAME already exists. Attaching."
    tmux attach-session -t $SESSION_NAME
    exit 0
fi

# --- Setup ---
# Create a new detached session, ensuring the first pane is in the correct path.
tmux new-session -d -s $SESSION_NAME -c "$MONOREPO_PATH" -n "Dev"

# --- Layout Creation ---
# This logic is now more robust.

# 1. Create the main 2/3 and 1/3 vertical split.
#    -c ensures the new pane (1.2) also starts in the correct directory.
#    Pane 1.1 is now the left (servers), Pane 1.2 is the right (CLI).
tmux split-window -h -p 33 -c "$MONOREPO_PATH" -t $SESSION_NAME:1.1

# 2. Subdivide the left pane (1.1) to create the top and bottom rows.
#    -c ensures the new bottom pane (1.2) starts in the correct directory.
#    The panes are now: 1.1 (top-left), 1.2 (bottom-left), 1.3 (right CLI).
tmux split-window -v -c "$MONOREPO_PATH" -t $SESSION_NAME:1.1

# 3. Split the top-left pane (1.1) to create the top-right pane.
#    The panes are now: 1.1 (TL), 1.2 (TR), 1.3 (BL), 1.4 (CLI).
tmux split-window -h -c "$MONOREPO_PATH" -t $SESSION_NAME:1.1

# 4. Split the bottom-left pane (1.3) to create the bottom-right pane.
#    The panes are now: 1.1(TL), 1.2(TR), 1.3(BL), 1.4(BR), 1.5(CLI).
tmux split-window -h -c "$MONOREPO_PATH" -t $SESSION_NAME:1.3

# 5. Re-balance the layout. This is the key fix for the uneven panes.
#    It tells tmux to make all panes in the window fit an even grid.
#    Because our CLI pane is already sectioned off, this primarily affects
#    the 4-pane grid, forcing it into a perfect 2x2.
tmux select-layout tiled

# --- Command Execution ---
# The pane indexes are now stable.
# Pane 1.1: Top-Left (Docker)
# Pane 1.2: Top-Right (API)
# Pane 1.3: Bottom-Left (Frontend)
# Pane 1.4: Bottom-Right (Extension)
# Pane 1.5: Bottom CLI

# Pane 1.1: Docker (always fresh: pull, rebuild without cache, then up)
tmux send-keys -t $SESSION_NAME:1.1 'echo "Starting Docker..." && docker compose pull && docker compose build && docker compose up --force-recreate --remove-orphans' C-m

# Pane 1.2: API Server
tmux send-keys -t $SESSION_NAME:1.2 'cd packages/api && bun --env-file ../../.env --watch src/server.ts' C-m

# Pane 1.3: Frontend Server
tmux send-keys -t $SESSION_NAME:1.3 'cd packages/frontend && npm run dev' C-m

# Pane 1.4: Extension Server
tmux send-keys -t $SESSION_NAME:1.4 'cd packages/extension && npm run dev' C-m

# --- Finalization ---
# Select the main CLI pane (1.5) so your cursor is ready there.
tmux select-pane -t $SESSION_NAME:1.5

# Attach to the fully prepared session
tmux attach-session -t $SESSION_NAME


# Prefix + : kill-session to terminal the entire session