#!/bin/sh
set -e

if [ -z "$CONFIG_PATH" ]; then
    echo "Error: CONFIG_PATH environment variable is not set"
    exit 1
fi

echo "=== Copying started at $(date) ==="
echo "Copy librechat to: $CONFIG_PATH"
cp /app/librechat.yaml $CONFIG_PATH/librechat.yaml

echo "=== Copying finished at $(date) ==="