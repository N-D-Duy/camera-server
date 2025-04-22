const path = require('path');
const fs = require('fs');
const express = require('express');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const moment = require('moment');
const { spawn } = require('child_process');
const { promisify } = require('util');

const app = express();
const WS_PORT = 8888;
const HTTP_PORT = 8000;


app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});


app.use('/recordings', express.static(path.join(__dirname, 'recordings')));
app.use(express.json());


const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const TEMP_DIR = path.join(RECORDINGS_DIR, 'temp');


function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o777 });
      fs.chmodSync(directory, 0o777); 
      console.log(`Created directory: ${directory}`);
    } catch (err) {
      console.error(`Error creating directory ${directory}:`, err);
      throw err;
    }
  }
}


ensureDirectoryExists(RECORDINGS_DIR);
ensureDirectoryExists(TEMP_DIR);


try {
  const testFile = path.join(TEMP_DIR, 'test-write-access.txt');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  console.log(`Directory permissions are correctly set: ${TEMP_DIR}`);
} catch (err) {
  console.error(`WARNING: Directory permission issue with ${TEMP_DIR}:`, err);
}


const db = new sqlite3.Database(path.join(__dirname, 'database/recordings.db'));
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration INTEGER NOT NULL,
    filesize INTEGER NOT NULL
  )`);
});


const wsServer = new WebSocket.Server({ port: WS_PORT }, () => 
  console.log(`WebSocket Server đang chạy tại cổng ${WS_PORT}`)
);




const CONFIG = {
  MIN_FRAMES_FOR_PROCESSING: 300,     
  TARGET_FPS: 15,                     
  FRAME_PROCESSING_INTERVAL: 15000,   
  MAX_BUFFER_SIZE: 3000,              
  QUALITY_PRESET: 'medium'            
};


const frameQueue = [];
let nextFrameIndex = 0;
let videoProcessRunning = false;
let recordingActive = false;
let lastFrameTimestamp = 0;
let frameRateStats = {
  count: 0,
  lastCheck: Date.now(),
  currentFps: 0
};


app.listen(HTTP_PORT, () => {
  console.log(`HTTP Server đang chạy tại cổng ${HTTP_PORT}`);
});


function updateFrameRateStats() {
  const now = Date.now();
  const elapsed = (now - frameRateStats.lastCheck) / 1000;
  
  if (elapsed >= 5) { 
    frameRateStats.currentFps = frameRateStats.count / elapsed;
    console.log(`Tốc độ nhận frame: ${frameRateStats.currentFps.toFixed(2)} FPS | Buffer hiện tại: ${frameQueue.length} frames`);
    
    frameRateStats.count = 0;
    frameRateStats.lastCheck = now;
  }
}


wsServer.on('connection', (ws, req) => {
  console.log('Client đã kết nối');
  
  ws.on('message', (data) => {
    try {
      
      wsServer.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
      
      const timestamp = Date.now();
      
      
      if (lastFrameTimestamp > 0) {
        const frameInterval = timestamp - lastFrameTimestamp;
        if (frameInterval > 500) { 
          console.log(`Khoảng cách frame lớn phát hiện: ${frameInterval}ms`);
        }
      }
      lastFrameTimestamp = timestamp;
      
      
      if (frameQueue.length >= CONFIG.MAX_BUFFER_SIZE) {
        console.log(`Buffer đầy (${frameQueue.length} frames), loại bỏ frame cũ nhất`);
        frameQueue.shift(); 
      }
      
      
      frameQueue.push({
        data: data, 
        timestamp: timestamp,
        index: nextFrameIndex++
      });
      
      
      if (!recordingActive) {
        recordingActive = true;
        console.log('Bắt đầu ghi lại');
      }
      
      
      frameRateStats.count++;
      updateFrameRateStats();
      
    } catch (err) {
      console.error('Lỗi khi xử lý frame:', err);
    }
  });
  
  ws.on('close', () => {
    console.log('Client đã ngắt kết nối');
  });
});


async function writeFileWithRetry(filePath, data, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await fs.promises.writeFile(filePath, data);
      return true;
    } catch (err) {
      console.error(`Error writing file ${filePath} (attempt ${attempt + 1}):`, err);
      if (attempt === retries - 1) throw err;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}


function calculateOptimalFrameRate(frames, actualDuration) {
  if (actualDuration <= 0) return CONFIG.TARGET_FPS;
  
  
  const actualFps = frames.length / actualDuration;
  console.log(`FPS thực tế từ dữ liệu: ${actualFps.toFixed(2)}`);
  
  
  if (actualFps >= 5 && actualFps <= 30) {
    return Math.round(actualFps);
  } else {
    return CONFIG.TARGET_FPS;
  }
}


async function processVideoQueue() {
  
  if (videoProcessRunning) {
    return; 
  }
  
  if (frameQueue.length < CONFIG.MIN_FRAMES_FOR_PROCESSING) {
    
    if (frameQueue.length > 0) {
      console.log(`Chưa đủ frame để xử lý: ${frameQueue.length}/${CONFIG.MIN_FRAMES_FOR_PROCESSING}`);
    }
    return;
  }
  
  videoProcessRunning = true;
  console.log(`Bắt đầu xử lý ${frameQueue.length} frame...`);
  
  
  let processingDir = null;
  let videoPath = null;
  
  try {
    
    const firstFrame = frameQueue[0];
    const lastFrame = frameQueue[frameQueue.length - 1];
    
    const startTime = new Date(firstFrame.timestamp);
    const endTime = new Date(lastFrame.timestamp);
    
    
    const actualDuration = (endTime - startTime) / 1000; 
    console.log(`Thời gian thực tế thu thập: ${actualDuration.toFixed(2)} giây`);
    
    
    const dateStr = moment(startTime).format('YYYY-MM-DD');
    const dateDir = path.join(RECORDINGS_DIR, dateStr);
    ensureDirectoryExists(dateDir);
    
    
    const timeStr = moment(startTime).format('HHmmss');
    const videoFilename = `cam_${dateStr.replace(/-/g, '')}_${timeStr}.mp4`;
    videoPath = path.join(dateDir, videoFilename);
    
    
    const timestamp = Date.now();
    processingDir = path.join(TEMP_DIR, `proc_${timestamp}`);
    
    
    if (fs.existsSync(processingDir)) {
      await fs.promises.rm(processingDir, { recursive: true, force: true });
    }
    
    
    ensureDirectoryExists(processingDir);
    
    
    if (!fs.existsSync(processingDir)) {
      throw new Error(`Failed to create processing directory: ${processingDir}`);
    }
    
    console.log(`Created processing directory: ${processingDir}`);
    
    
    const framesToProcess = [...frameQueue];
    frameQueue.splice(0, framesToProcess.length);
    
    
    const optimalFrameRate = calculateOptimalFrameRate(framesToProcess, actualDuration);
    console.log(`Sử dụng framerate: ${optimalFrameRate} FPS cho video`);
    
    
    const expectedVideoDuration = framesToProcess.length / optimalFrameRate;
    console.log(`Dự kiến thời lượng video: ${expectedVideoDuration.toFixed(2)} giây`);
    
    
    console.log(`Writing ${framesToProcess.length} frames to disk...`);
    
    const frameFiles = [];
    
    
    const batchSize = 10;
    for (let i = 0; i < framesToProcess.length; i += batchSize) {
      const batch = framesToProcess.slice(i, i + batchSize);
      await Promise.all(batch.map(async (frame) => {
        const frameFilename = `frame_${frame.index.toString().padStart(6, '0')}.jpg`;
        const frameFilePath = path.join(processingDir, frameFilename);
        
        try {
          await writeFileWithRetry(frameFilePath, frame.data);
          frameFiles.push(frameFilename);
        } catch (writeErr) {
          console.error(`Error writing frame file ${frameFilename}:`, writeErr);
          throw writeErr;
        }
      }));
      
      
      if (framesToProcess.length > 50 && i % 50 === 0) {
        console.log(`Progress: ${i}/${framesToProcess.length} frames written`);
      }
    }
    
    console.log(`Successfully wrote ${frameFiles.length} frames to ${processingDir}`);
    
    
    const existingFiles = fs.readdirSync(processingDir);
    console.log(`Files in directory ${processingDir}: ${existingFiles.length} files`);
    
    if (existingFiles.length === 0) {
      throw new Error('No frame files were created');
    }
    
    
    existingFiles.sort();
    console.log(`First frame: ${existingFiles[0]}, Last frame: ${existingFiles[existingFiles.length - 1]}`);
    
    
    console.log(`Bắt đầu tạo video: ${videoFilename}`);
    
    
    const frameListPath = path.join(processingDir, 'frames.txt');
    const frameListContent = existingFiles
      .filter(file => file.startsWith('frame_') && file.endsWith('.jpg'))
      .sort()
      .map(file => `file '${path.join(processingDir, file)}'`)
      .join('\n');
    
    await fs.promises.writeFile(frameListPath, frameListContent);
    console.log(`Created frame list at ${frameListPath}`);
    
    
    const result = await new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-y', 
        '-f', 'concat',
        '-safe', '0',
        '-i', frameListPath,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', CONFIG.QUALITY_PRESET,
        '-framerate', optimalFrameRate.toString(), 
        videoPath
      ];

      
      console.log(`Running ffmpeg with command: ffmpeg ${ffmpegArgs.join(' ')}`);
      
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      
      let ffmpegOutput = '';
      
      ffmpegProcess.stdout.on('data', (data) => {
        const output = data.toString();
        ffmpegOutput += output;
        if (output.trim()) console.log(`ffmpeg stdout: ${output.trim()}`);
      });
      
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        ffmpegOutput += output;
        if (output.trim()) console.log(`ffmpeg stderr: ${output.trim()}`);
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          console.log(`ffmpeg completed successfully with code ${code}`);
          resolve(true);
        } else {
          console.error(`ffmpeg failed with code ${code}`);
          reject(new Error(`ffmpeg exited with code ${code}: ${ffmpegOutput}`));
        }
      });
      
      ffmpegProcess.on('error', (err) => {
        console.error(`ffmpeg process error:`, err);
        reject(err);
      });
    });
    
    console.log(`Video đã được tạo: ${videoFilename}`);
    
    
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file was not created at ${videoPath}`);
    }
    
    
    const stats = await fs.promises.stat(videoPath);
    const filesize = stats.size;
    
    console.log(`Video size: ${filesize} bytes`);
    
    const adjustmentFactor = 3.2;
    const finalDuration = expectedVideoDuration / adjustmentFactor;
    
    
    const relativeFilePath = path.join(dateStr, videoFilename);
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO recordings (filename, start_time, end_time, duration, filesize) VALUES (?, ?, ?, ?, ?)',
        [relativeFilePath, startTime.toISOString(), endTime.toISOString(), finalDuration, filesize],
        function(err) {
          if (err) {
            console.error('Database insertion error:', err);
            reject(err);
          } else {
            console.log(`Saved recording to database with ID ${this.lastID}`);
            resolve(this.lastID);
          }
        }
      );
    });
    
  } catch (err) {
    console.error('Lỗi khi xử lý video:', err);
    
    if (err.stack) console.error(err.stack);
  } finally {
    
    try {
      if (processingDir && fs.existsSync(processingDir)) {
        await fs.promises.rm(processingDir, { recursive: true, force: true });
        console.log(`Cleaned up processing directory: ${processingDir}`);
      }
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
    }
    
    videoProcessRunning = false;
  }
}


setInterval(() => {
  processVideoQueue().catch(err => {
    console.error('Error in processVideoQueue:', err);
    videoProcessRunning = false;
  });
}, CONFIG.FRAME_PROCESSING_INTERVAL);


app.get('/api/recordings', (req, res) => {
  
  const date = req.query.date || moment().format('YYYY-MM-DD');
  const query = 'SELECT * FROM recordings WHERE filename LIKE ? ORDER BY start_time DESC';
  
  db.all(query, [`${date}%`], (err, rows) => {
    if (err) {
      console.error('Lỗi khi truy vấn database:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json(rows);
  });
});


app.get('/api/recordings/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM recordings WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Lỗi khi truy vấn database:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json(row);
  });
});


app.get('/client', (req, res) => {
  res.sendFile(path.resolve(__dirname, './client.html'));
});


app.get('/recordings-viewer', (req, res) => {
  res.sendFile(path.resolve(__dirname, './recordings.html'));
});


app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    stats: {
      bufferSize: frameQueue.length,
      currentFps: frameRateStats.currentFps,
      videoProcessRunning: videoProcessRunning
    }
  });
});


app.get('/', (req, res) => {
  res.status(200).send('Camera Server is running');
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  
});