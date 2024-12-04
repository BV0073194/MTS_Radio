import http from 'http';
import fs from 'fs';
import fetch from 'node-fetch';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

// Polyfill for __dirname and __filename in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const queueFolder = path.join(__dirname, 'queue'); // Folder to hold the queued songs

// Ensure the queue folder exists
if (!fs.existsSync(queueFolder)) {
  fs.mkdirSync(queueFolder);
}

let clients = [];
let currentStream = null;
let currentFile = null;

// Function to download an MP3 from a URL and add it to the queue
async function downloadMP3(url, songName, author) {
  const sanitizedSongName = songName.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize for safe filenames
  const sanitizedAuthor = author.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${Date.now()}_${sanitizedAuthor}_${sanitizedSongName}.mp3`;
  const filePath = path.join(queueFolder, fileName);

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
}

// Function to get the list of files in the queue
function getQueue() {
  const files = fs.readdirSync(queueFolder).filter(file => file.endsWith('.mp3'));
  files.sort(); // Ensure files are processed in chronological order
  return files;
}

// Function to play the next song in the queue
function playNext() {
  if (currentStream) {
    currentStream.destroy();
    currentStream = null;
  }

  const queue = getQueue();
  if (queue.length > 0) {
    currentFile = path.join(queueFolder, queue[0]);
    console.log(`Now playing: ${queue[0]}`);
    currentStream = fs.createReadStream(currentFile);

    currentStream.on('data', (chunk) => {
      clients.forEach((res) => res.write(chunk));
    });

    currentStream.on('end', () => {
      console.log(`Finished playing: ${queue[0]}`);
      fs.unlinkSync(currentFile); // Delete the file after playing
      currentFile = null;
      playNext(); // Move to the next song
    });

    currentStream.on('error', (err) => {
      console.error(`Error streaming file: ${err}`);
      playNext(); // Skip to the next song if there's an error
    });
  } else {
    console.log('Queue is empty. Waiting for new songs...');
  }
}

// HTTP Server to handle live streaming and HTML page
const server = http.createServer((req, res) => {
  if (req.url === '/audio.mp3') {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    clients.push(res);

    // Remove client when they disconnect
    req.on('close', () => {
      clients = clients.filter(client => client !== res);
    });

    console.log('New listener connected.');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Live Stream</title>
      </head>
      <body>
        <h1>Live Streaming Radio</h1>
        <p>Listen to the live stream:</p>
        <audio controls autoplay>
          <source src="/audio.mp3" type="audio/mpeg">
          Your browser does not support the audio element.
        </audio>
      </body>
      </html>
    `);
  }
});

// Start the server
server.listen(8000, () => {
  console.log('Server running at http://localhost:8000');
});

// CLI for uploading and managing the queue
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
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
        try {
          await downloadMP3(url, songName, author);
          console.log(`Song "${songName}" by "${author}" added to the queue.`);
          if (!currentStream) {
            playNext();
          }
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
