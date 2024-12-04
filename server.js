import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const queueFolder = path.join(__dirname, 'queue'); // Folder to store queued songs
const placeholderFile = path.join(__dirname, 'placeholder.mp3'); // Placeholder audio for silence or default music

// Ensure the queue folder exists
if (!fs.existsSync(queueFolder)) {
  fs.mkdirSync(queueFolder);
}

// Ensure the placeholder file exists
if (!fs.existsSync(placeholderFile)) {
  console.log('Generating placeholder.mp3...');
  const command = `ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 5 -acodec libmp3lame ${placeholderFile}`;
  execSync(command);
  console.log('placeholder.mp3 generated.');
}

// Get the list of queued songs
function getQueue() {
  const files = fs.readdirSync(queueFolder).filter(file => file.endsWith('.mp3'));
  files.sort(); // Ensure songs are played in the order they were added
  return files;
}

// Stream audio data to clients
function streamAudio(res) {
  const queue = getQueue();
  const currentFile = queue.length > 0 ? path.join(queueFolder, queue[0]) : placeholderFile;

  console.log(`Streaming: ${currentFile}`);

  const stream = fs.createReadStream(currentFile);

  stream.on('data', chunk => {
    res.write(chunk); // Send audio data to the client
  });

  stream.on('end', () => {
    if (currentFile === placeholderFile) {
      console.log('Looping placeholder audio...');
      streamAudio(res); // Loop placeholder if no songs are in the queue
    } else {
      console.log(`Finished streaming: ${currentFile}`);
      fs.unlinkSync(currentFile); // Delete song after playback
      streamAudio(res); // Play the next song or loop placeholder
    }
  });

  stream.on('error', err => {
    console.error(`Error streaming ${currentFile}:`, err);
    streamAudio(res); // Retry with placeholder
  });
}

// Create an HTTP server
const server = http.createServer((req, res) => {
  if (req.url === '/audio.mp3') {
    console.log('New listener connected.');
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
    });

    streamAudio(res);

    req.on('close', () => {
      console.log('Listener disconnected.');
      res.end();
    });
  } else {
    console.log(`404 for ${req.url}`);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

// Start the server
server.listen(8000, () => {
  console.log('Server is running at http://localhost:8000/audio.mp3');
});
