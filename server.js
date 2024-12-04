import http from 'http';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import fetch from 'node-fetch';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const queueFolder = path.join(__dirname, 'queue'); // Folder for queued songs
const placeholderFile = path.join(__dirname, 'placeholder.mp3'); // Placeholder audio file
let listeners = []; // List of connected listeners
let currentStream = null; // Current audio stream
let currentFile = null; // Current file being streamed
let isPlayingPlaceholder = false;

// Utility function to log events with timestamps
function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Ensure queue folder exists
if (!fs.existsSync(queueFolder)) {
  fs.mkdirSync(queueFolder);
}

// Ensure placeholder file exists
if (!fs.existsSync(placeholderFile)) {
  logWithTimestamp('Generating placeholder.mp3...');
  const command = `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 5 -acodec libmp3lame ${placeholderFile}`;
  execSync(command);
  logWithTimestamp('placeholder.mp3 generated.');
}

// Get the list of queued songs
function getQueue() {
  const files = fs.readdirSync(queueFolder).filter(file => file.endsWith('.mp3'));
  files.sort(); // Ensure songs play in the order they were added
  return files;
}

// Broadcast audio chunks to all listeners
function broadcastAudio(chunk) {
  listeners.forEach(listener => {
    listener.write(chunk);
  });
}

// Start streaming a file
function startStreamingFile(filePath) {
  if (!isPlayingPlaceholder && filePath === placeholderFile) {
    logWithTimestamp('Switching to placeholder audio...');
  } else if (filePath !== placeholderFile) {
    logWithTimestamp(`Now playing: ${path.basename(filePath)}`);
  }

  currentFile = filePath;
  isPlayingPlaceholder = filePath === placeholderFile;
  currentStream = fs.createReadStream(filePath);

  currentStream.on('data', chunk => {
    broadcastAudio(chunk); // Send audio chunk to all listeners
  });

  currentStream.on('end', () => {
    if (filePath !== placeholderFile) {
      logWithTimestamp(`Finished playing: ${path.basename(filePath)}`);
      fs.unlinkSync(filePath); // Remove the file after it's done
    }
    playNextInQueue(); // Move to the next song or the placeholder
  });

  currentStream.on('error', err => {
    logWithTimestamp(`Error streaming ${filePath}: ${err.message}`);
    playNextInQueue(); // Fallback to the next song or placeholder
  });
}

// Play the next file in the queue or the placeholder
function playNextInQueue() {
  const queue = getQueue();
  if (queue.length > 0) {
    const nextFile = path.join(queueFolder, queue[0]);
    startStreamingFile(nextFile);
  } else {
    startStreamingFile(placeholderFile); // Play placeholder if queue is empty
  }
}

// Handle a new listener connection
function handleNewListener(res) {
  logWithTimestamp('New listener connected.');
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
  });

  listeners.push(res);

  // Remove listener on disconnect
  res.on('close', () => {
    logWithTimestamp('Listener disconnected.');
    listeners = listeners.filter(listener => listener !== res);
  });
}

// HTTP server for streaming
const server = http.createServer((req, res) => {
  if (req.url === '/audio.mp3') {
    handleNewListener(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

// Start the server
server.listen(8000, () => {
  logWithTimestamp('Server is live at http://localhost:8000/audio.mp3');
  playNextInQueue(); // Start streaming
});

// CLI for queue management
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

logWithTimestamp('Commands:');
logWithTimestamp('  upload: <url>    - Download and queue an MP3 for streaming');
logWithTimestamp('  queue show       - Show the current queue');
logWithTimestamp('  queue clear      - Clear the entire queue');
logWithTimestamp('  queue clear <n>  - Remove a specific song from the queue');

rl.on('line', async (input) => {
  if (input.startsWith('upload: ')) {
    const url = input.slice(8).trim();
    rl.question('Enter song name: ', (songName) => {
      rl.question('Enter author name: ', async (author) => {
        const sanitizedSongName = songName.replace(/[^a-zA-Z0-9]/g, '_');
        const sanitizedAuthor = author.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${Date.now()}_${sanitizedAuthor}_${sanitizedSongName}.mp3`;
        const filePath = path.join(queueFolder, fileName);

        try {
          logWithTimestamp(`Downloading from: ${url}`);
          const response = await fetch(url);

          if (!response.ok) {
            logWithTimestamp(`Failed to download: ${response.statusText}`);
            return;
          }

          const fileStream = fs.createWriteStream(filePath);
          await new Promise((resolve, reject) => {
            response.body.pipe(fileStream);
            response.body.on('error', reject);
            fileStream.on('finish', resolve);
          });

          logWithTimestamp(`Added to queue: ${fileName}`);
        } catch (error) {
          logWithTimestamp(`Error downloading the file: ${error.message}`);
        }
      });
    });
  } else if (input === 'queue show') {
    const queue = getQueue();
    if (queue.length > 0) {
      logWithTimestamp('Current queue:');
      queue.forEach((file, index) => {
        const [timestamp, author, songName] = file.split('_').map(decodeURIComponent);
        logWithTimestamp(`${index + 1}. ${songName.replace('.mp3', '')} by ${author}`);
      });
    } else {
      logWithTimestamp('The queue is empty.');
    }
  } else if (input === 'queue clear') {
    getQueue().forEach(file => fs.unlinkSync(path.join(queueFolder, file)));
    logWithTimestamp('Queue cleared.');
  } else if (input.startsWith('queue clear ')) {
    const index = parseInt(input.slice(12).trim(), 10);
    const queue = getQueue();
    if (!isNaN(index) && index > 0 && index <= queue.length) {
      fs.unlinkSync(path.join(queueFolder, queue[index - 1]));
      logWithTimestamp(`Removed song ${index} from the queue.`);
    } else {
      logWithTimestamp('Invalid song number.');
    }
  } else {
    logWithTimestamp('Unknown command. Use "upload: <url>", "queue show", "queue clear", or "queue clear <n>".');
  }
});
