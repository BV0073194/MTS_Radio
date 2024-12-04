import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { addSongToQueue, streamSongs, listQueue, removeFromQueue } from "./stream.js";

// Define __dirname for ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8000;

// Middleware to parse JSON body
app.use(express.json());

// Configure file uploads
const upload = multer({ dest: "uploads/" });

// Ensure the "songs" directory exists
const songsDir = path.join(__dirname, "songs");
if (!fs.existsSync(songsDir)) {
    fs.mkdirSync(songsDir);
}

// Helper function to download an MP3 file
async function downloadFromURL(url, dest) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const fileStream = fs.createWriteStream(dest);
    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on("error", reject);
        fileStream.on("finish", resolve);
    });
    console.log(`Downloaded file from URL to: ${dest}`);
    return dest;
}

// Add songs to the queue when downloaded
app.post("/upload", async (req, res) => {
    const songUrl = req.body.url;
    if (!songUrl) {
        return res.status(400).send("Please provide a valid URL.");
    }

    try {
        const fileName = path.basename(songUrl);
        const filePath = path.join(songsDir, fileName);

        await downloadFromURL(songUrl, filePath);

        addSongToQueue(filePath); // Add to queue
        res.send(`Song downloaded and added to queue: ${filePath}`);
    } catch (error) {
        console.error(error);
        res.status(500).send("Failed to download the song.");
    }
});

// Stream endpoint
app.get("/stream.mp3", (req, res) => {
    streamSongs(req, res);
});

// API to list the current queue
app.get("/queue", (req, res) => {
    const queue = listQueue();
    res.json(queue);
});

// API to remove a song from the queue
app.delete("/queue/:index", (req, res) => {
    const index = parseInt(req.params.index, 10);
    if (isNaN(index)) {
        return res.status(400).send("Invalid index.");
    }

    removeFromQueue(index);
    res.send(`Removed song at index: ${index}`);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
