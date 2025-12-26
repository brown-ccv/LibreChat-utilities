#!/bin/sh
set -e

echo "=== Cleaning started at $(date) ==="
echo "Days to clean: $DAYS_TO_CLEAN"

# Check if directory exists
if [ ! -d "$LOG_DIR_TO_CLEAN" ]; then
    echo "ERROR: Directory $LOG_DIR_TO_CLEAN does not exist"
    exit 1
fi

# Cleaning old files
echo "Files that would be deleted:"
find "$LOG_DIR_TO_CLEAN" -mindepth 1 -type f \( -name '*.log.*' -o -name '*.log' \) -mtime +"$DAYS_TO_CLEAN" -print
echo "Cleaning old files in: $LOG_DIR_TO_CLEAN"
find "$LOG_DIR_TO_CLEAN" -mindepth 1 -type f \( -name '*.log.*' -o -name '*.log' \) -mtime +"$DAYS_TO_CLEAN" -delete

echo "=== Cleaning finished at $(date) ==="