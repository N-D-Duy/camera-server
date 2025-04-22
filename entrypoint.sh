#!/bin/bash
set -e

echo "Setting up camera server environment..."

# Create necessary directories
mkdir -p /app/recordings 
mkdir -p /app/database 
mkdir -p /app/recordings/temp

# Set permissions to avoid access issues
chmod -R 777 /app/recordings
chmod -R 777 /app/database
chmod -R 777 /app/recordings/temp

echo "Directory structure:"
ls -la /app/recordings
ls -la /app/recordings/temp
ls -la /app/database

echo "Testing ffmpeg..."
ffmpeg -version | head -n 1

echo "Starting camera server..."
npm start
