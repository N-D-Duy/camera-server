# ESP32-CAM Streaming Server

A Node.js server that receives image streams from ESP32-CAM devices, displays them in real-time, and stores recordings for later viewing.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Monitoring](#monitoring)
- [License](#license)

## Features

- Real-time video streaming via WebSockets
- Video recording with configurable parameters
- Historical recordings browser with date filtering
- Automatic video creation from image frames
- Prometheus metrics for monitoring
- Containerized with Docker for easy deployment

## Requirements

- Node.js 18+
- FFmpeg
- SQLite3
- Docker and Docker Compose (for containerized deployment)

## Installation

### Local Development

1. Clone the repository
```bash
git clone https://github.com/N-D-Duy/camera-server
cd camera-server
```

2. Install dependencies
```bash
npm install
```

3. Ensure FFmpeg is installed on your system
```bash
ffmpeg -version
```

4. Create the required directories
```bash
mkdir -p recordings/temp database
```

### Docker Deployment

See the [Docker Deployment](#docker-deployment) section below.

## Usage

### Start the server

```bash
npm start
```

The server will run on:
- HTTP server: Port 8000
- WebSocket server: Port 8888

### Access the web interface

- Live stream: http://localhost:8000/client
- Recordings browser: http://localhost:8000/recordings-viewer
- Health check: http://localhost:8000/health
- Metrics: http://localhost:8000/metrics

## Architecture

The system consists of:

1. **WebSocket Server**: Receives image frames from ESP32-CAM devices
2. **Express Server**: Serves the web client and API endpoints
3. **Video Processor**: Converts image frames to MP4 videos using FFmpeg
4. **SQLite Database**: Stores metadata about recordings
5. **Web Clients**: Live viewer and recordings browser

## API Endpoints

- `GET /api/recordings`: List all recordings with optional date filter
- `GET /api/recordings/:id`: Get details about a specific recording
- `GET /health`: Server health check endpoint
- `GET /metrics`: Prometheus metrics endpoint

## Configuration

The server configuration is defined in the `CONFIG` object in `server.js`:

```javascript
const CONFIG = {
  MIN_FRAMES_FOR_PROCESSING: 300,     // Min frames before processing
  TARGET_FPS: 15,                     // Target framerate for recordings
  FRAME_PROCESSING_INTERVAL: 15000,   // How often to process frames (ms)
  MAX_BUFFER_SIZE: 3000,              // Max frames to buffer
  QUALITY_PRESET: 'medium'            // FFmpeg encoding quality preset
};
```

## Docker Deployment

1. Build and start the Docker container:
```bash
docker compose up -d
```

2. Check the container status:
```bash
docker compose ps
```

3. View logs:
```bash
docker compose logs -f
```

## Monitoring

The server exposes Prometheus metrics at the `/metrics` endpoint, including:
- HTTP request counts and durations
- Default Node.js metrics (memory usage, etc.)

You can use these metrics with Prometheus and Grafana for monitoring.

## Contributing
Contributions are welcome! Please fork the repository and submit a pull request with your changes.
Make sure to follow the code style and include tests for new features.

## Contact
For any questions or issues, please open an issue on GitHub or contact the author:
- [Duy Nguyen](mailto:nguyenducduypc160903@gmail.com)