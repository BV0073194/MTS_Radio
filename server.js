const express = require("express");
const fs = require("fs");
const fetch = require("node-fetch");
const path = require("path");
const readline = require("readline");

const app = express();
const PORT = 8000;

// Global song queue
let songQueue = [];

// Helper to download MP3
async function downloadSong(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
  const fileStream = fs.createWriteStream(filePath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
  console.log(`Downloaded: ${filePath}`);
}

// Add a song to the queue
async function addToQueue(url) {
  const fileName = path.basename(url);
  const filePath = path.join(__dirname, "songs", fileName);

  if (!fs.existsSync(path.join(__dirname, "songs"))) {
    fs.mkdirSync(path.join(__dirname, "songs"));
  }

  try {
    await downloadSong(url, filePath);
    songQueue.push(filePath);
    console.log(`Added to queue: ${filePath}`);
  } catch (error) {
    console.error(`Failed to add song: ${error.message}`);
  }
}

// Remove a song from the queue
function removeFromQueue(index) {
  if (index < 0 || index >= songQueue.length) {
    console.log("Invalid index. Please try again.");
    return;
  }
  const removed = songQueue.splice(index, 1);
  console.log(`Removed from queue: ${removed}`);
}

// List the queue
function listQueue() {
  if (songQueue.length === 0) {
    console.log("The queue is empty.");
  } else {
    console.log("Current queue:");
    songQueue.forEach((song, index) => {
      console.log(`${index}: ${song}`);
    });
  }
}

// Stream the audio queue
function streamSongs(req, res) {
  if (songQueue.length === 0) {
    res.status(200).send("No songs in the queue!");
    return;
  }

  let currentSongIndex = 0;

  const playNextSong = () => {
    if (currentSongIndex >= songQueue.length) {
      res.end(); // End stream when no songs are left
      return;
    }

    const currentSongPath = songQueue[currentSongIndex];
    const readStream = fs.createReadStream(currentSongPath);

    readStream.pipe(res, { end: false });
    readStream.on("end", () => {
      currentSongIndex++;
      playNextSong();
    });

    readStream.on("error", (err) => {
      console.error(`Error streaming song: ${err.message}`);
      res.end();
    });
  };

  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Transfer-Encoding": "chunked",
  });
  playNextSong();
}

// API Endpoints
app.post("/add-song", async (req, res) => {
  const songUrl = req.query.url;
  if (!songUrl) {
    return res.status(400).send("Please provide a song URL as a query parameter.");
  }

  await addToQueue(songUrl);
  res.send("Song added to the queue!");
});

// Streaming endpoint
app.get("/audio.mp3", (req, res) => {
  streamSongs(req, res);
});

// Command-Line Interface
function startCLI() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "queue> ",
  });

  console.log("CLI started. Available commands:");
  console.log("  add <url> - Add a song to the queue");
  console.log("  remove <index> - Remove a song from the queue");
  console.log("  list - List the current queue");
  console.log("  exit - Exit the CLI");

  rl.prompt();

  rl.on("line", async (line) => {
    const [command, ...args] = line.trim().split(" ");

    switch (command) {
      case "add":
        if (args.length === 0) {
          console.log("Usage: add <url>");
        } else {
          await addToQueue(args[0]);
        }
        break;

      case "remove":
        if (args.length === 0 || isNaN(parseInt(args[0], 10))) {
          console.log("Usage: remove <index>");
        } else {
          removeFromQueue(parseInt(args[0], 10));
        }
        break;

      case "list":
        listQueue();
        break;

      case "exit":
        rl.close();
        process.exit(0);
        break;

      default:
        console.log("Unknown command. Available commands: add, remove, list, exit");
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("CLI closed.");
  });
}

// Start the server and CLI
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  startCLI();
});
