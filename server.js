import http from 'http';
import fs from 'fs';
import readline from 'readline';
import fetch from 'node-fetch';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const queueFolder = path.join(__dirname, 'queue'); // Folder for queued songs
const placeholderFile = path.join(__dirname, 'placeholder.mp3'); // Placeholder audio file
let listeners = []; // List of connected listeners
let currentStream = null; // The current shared stream
let currentFile = null; // The current file being played
let isPlayingPlaceholder = false;

// Ensure queue folder exists
if (!fs.existsSync(queueFolder)) {
  fs.mkdirSync(queueFolder);
}

// Ensure placeholder file exists
if (!fs.existsSync(placeholderFile)) {
  console.log('Generating placeholder.mp3...');
  const command = `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 5 -acodec libmp3lame ${placeholderFile}`;
  execSync(command);
  console.log('placeholder.mp3 generated.');
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

// Start streaming a file to all listeners
function startStreamingFile(filePath) {
  if (filePath !== placeholderFile) {
    console.log(`Streaming: ${filePath}`);
  }

  currentFile = filePath;
  isPlayingPlaceholder = filePath === placeholderFile;

  currentStream = fs.createReadStream(filePath);

  currentStream.on('data', chunk => {
    broadcastAudio(chunk); // Send audio chunk to all connected listeners
  });

  currentStream.on('end', () => {
    if (filePath !== placeholderFile) {
      console.log(`Finished streaming: ${filePath}`);
    }

    if (!isPlayingPlaceholder && filePath !== placeholderFile) {
      fs.unlinkSync(filePath); // Delete the file after it's done playing
    }

    playNextInQueue(); // Move to the next song or the placeholder
  });

  currentStream.on('error', err => {
    console.error(`Error streaming ${filePath}:`, err);
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
    startStreamingFile(placeholderFile); // Play the placeholder if the queue is empty
  }
}

// Handle a new listener connection
function handleNewListener(res) {
  console.log('New listener connected.');
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
  });

  listeners.push(res);

  res.on('close', () => {
    console.log('Listener disconnected.');
    listeners = listeners.filter(listener => listener !== res);
  });
}

// HTTP server for streaming
const server = http.createServer((req, res) => {
  if (req.url === '/audio.mp3') {
    handleNewListener(res);

    // If a stream is already playing, immediately start sending chunks
    if (currentStream) {
      const listenerStream = fs.createReadStream(currentFile, { start: currentStream.bytesRead });
      listenerStream.on('data', chunk => res.write(chunk));
      listenerStream.on('end', () => res.end());
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

// Start the server
server.listen(8000, () => {
  console.log('Server is running at http://localhost:8000/audio.mp3');
  playNextInQueue(); // Start the stream
});

// CLI for queue management
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('Commands:');
console.log('  upload: <url>    - Download and queue an MP3 for streaming');
console.log('  queue show       - Show the current queue');
console.log('  queue clear      - Clear the entire queue');
console.log('  queue clear <n>  - Remove a specific song from the queue');

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
          console.log(`Downloading from: ${url}`);
          const response = await fetch(url);

          if (!response.ok) {
            console.error(`Failed to download: ${response.statusText}`);
            return;
          }

          const fileStream = fs.createWriteStream(filePath);
          await new Promise((resolve, reject) => {
            response.body.pipe(fileStream);
            response.body.on('error', reject);
            fileStream.on('finish', resolve);
          });

          console.log(`Added to queue: ${fileName}`);
        } catch (error) {
          console.error('Error downloading the file:', error);
        }
      });
    });
  } else if (input === 'queue show') {
    const queue = getQueue();
    if (queue.length > 0) {
      console.log('Current queue:');
      queue.forEach((file, index) => {
        const [timestamp, author, songName] = file.split('_').map(decodeURIComponent);
        console.log(`${index + 1}. ${songName.replace('.mp3', '')} by ${author}`);
      });
    } else {
      console.log('The queue is empty.');
    }
  } else if (input === 'queue clear') {
    getQueue().forEach(file => fs.unlinkSync(path.join(queueFolder, file)));
    console.log('Queue cleared.');
  } else if (input.startsWith('queue clear ')) {
    const index = parseInt(input.slice(12).trim(), 10);
    const queue = getQueue();
    if (!isNaN(index) && index > 0 && index <= queue.length) {
      fs.unlinkSync(path.join(queueFolder, queue[index - 1]));
      console.log(`Removed song ${index} from the queue.`);
    } else {
      console.log('Invalid song number.');
    }
  } else {
    console.log('Unknown command. Use "upload: <url>", "queue show", "queue clear", or "queue clear <n>".');
  }
});
