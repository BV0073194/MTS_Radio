import http from 'http';
import fs from 'fs';
import fetch from 'node-fetch';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill for __dirname and __filename in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const queueFolder = path.join(__dirname, 'queue'); // Folder to hold the queued songs

// Ensure the queue folder exists
if (!fs.existsSync(queueFolder)) {
  fs.mkdirSync(queueFolder);
}

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

// Function to clear all or a specific file in the queue
function clearQueue(index = null) {
  const files = getQueue();
  if (index === null) {
    // Clear all files
    files.forEach(file => fs.unlinkSync(path.join(queueFolder, file)));
    console.log('Queue cleared.');
  } else if (index >= 1 && index <= files.length) {
    const filePath = path.join(queueFolder, files[index - 1]);
    fs.unlinkSync(filePath);
    console.log(`Removed song ${index} from the queue.`);
  } else {
    console.log('Invalid song number.');
  }
}

// HTTP Server to stream the current file in the queue
http.createServer((req, res) => {
  const queue = getQueue();
  if (queue.length > 0) {
    const nextFile = path.join(queueFolder, queue[0]);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    const stream = fs.createReadStream(nextFile);

    stream.pipe(res);

    stream.on('end', () => {
      console.log(`Finished streaming: ${nextFile}`);
      fs.unlinkSync(nextFile); // Delete the file after streaming
    });

    stream.on('error', (err) => {
      console.error(`Error streaming file: ${err}`);
      res.end();
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('No audio files in the queue. Please upload one.');
  }
}).listen(8000);

console.log('Streaming on http://localhost:8000');

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
    console.log(`Processing upload command for URL: ${url}`);

    rl.question('Enter song name: ', (songName) => {
      rl.question('Enter author name: ', async (author) => {
        try {
          await downloadMP3(url, songName, author);
          console.log(`Song "${songName}" by "${author}" added to the queue.`);
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
    clearQueue();
  } else if (input.startsWith('queue clear ')) {
    const index = parseInt(input.slice(12).trim(), 10);
    if (isNaN(index)) {
      console.log('Invalid command. Please specify a valid song number.');
    } else {
      clearQueue(index);
    }
  } else {
    console.log('Unknown command. Use "upload: <url>", "queue show", "queue clear", or "queue clear <n>".');
  }
});
