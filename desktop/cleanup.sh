#!/bin/bash
# Kill stale Vite/Wails processes before starting dev.
for port in 5173 9245 34115; do
  pids=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing processes on port $port: $pids"
    kill $pids 2>/dev/null
  fi
done
echo "Ports clear. Ready to start."
