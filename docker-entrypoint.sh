#!/bin/bash
set -e

# Check if we're running in non-headless mode
if [ "$BROWSER_HEADLESS" = "false" ]; then
  echo "Starting Xvfb for non-headless browser mode..."
  Xvfb :99 -screen 0 1280x1024x24 &
  sleep 1
  echo "Xvfb started"
fi

# Start the application
exec node dist/index.js
