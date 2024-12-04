import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

const app = express();
const PORT = 8000;

// Configure file uploads
const upload = multer({ dest: "uploads/" });

// Global variables
let songQueue = [];
let currentSongIndex = 0;
let isPlaying = false;

let isStreaming = false; // Prevent multiple streams
let currentTimestamp = 0; // Track the current position in the song


// Create "songs" directory if it doesn't exist
const songsDir = path.join(process.cwd(), "songs");
if (!fs.existsSync(songsDir)) fs.mkdirSync(songsDir);

// Serve static files for web interface
app.use(express.static("public"));

// Parse JSON body
app.use(express.json());

// Helper to download a song from a URL
async function downloadFromURL(url) {
    const fileName = path.basename(url);
    const filePath = path.join(songsDir, fileName);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download song: ${response.statusText}`);
    }

    const fileStream = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on("error", reject);
        fileStream.on("finish", resolve);
    });

    console.log(`Downloaded song from URL to: ${filePath}`);
    return { path: filePath, name: fileName };
}

// Live update for queue display
app.get("/queue", (req, res) => {
    res.json({
        currentSong: songQueue[currentSongIndex]?.name || "No song playing",
        queue: songQueue.map((song, idx) => ({
            index: idx,
            name: path.basename(song.path),
        })),
    });
});

// File upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
    const tempPath = req.file.path;
    const targetPath = path.join(songsDir, req.file.originalname);

    fs.rename(tempPath, targetPath, (err) => {
        if (err) {
            console.error("Error saving file:", err);
            return res.status(500).send("Error saving file.");
        }

        songQueue.push({ path: targetPath, name: req.file.originalname });
        console.log(`Added to queue: ${req.file.originalname}`);
        res.redirect("/");
    });
});

// URL-based upload endpoint
app.post("/upload-url", async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).send("Please provide a valid URL.");
    }

    try {
        const song = await downloadFromURL(url);
        songQueue.push(song);
        res.redirect("/");
    } catch (error) {
        console.error(error);
        res.status(500).send("Failed to download the song.");
    }
});

// Stream endpoint
app.get("/stream.mp3", (req, res) => {
    if (songQueue.length === 0) {
        res.status(200).send("No songs in the queue.");
        return;
    }

    if (isStreaming) {
        res.status(400).send("Streaming is already in progress.");
        return;
    }

    isStreaming = true;

    const currentSong = songQueue[currentSongIndex];
    const startAt = currentTimestamp;

    console.log(`Streaming song: ${currentSong.name}`);

    const ffmpegStream = ffmpeg(currentSong.path)
        .seekInput(startAt) // Start from the current timestamp
        .audioCodec("libmp3lame")
        .format("mp3");

    res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
    });

    ffmpegStream.pipe(res);

    // Cleanup when the client disconnects
    res.on("close", () => {
        ffmpegStream.kill("SIGKILL");
        isStreaming = false;
        console.log("Client disconnected. Stopped streaming.");
    });

    // Handle ffmpeg errors
    ffmpegStream.on("error", (err) => {
        console.error(`FFmpeg error: ${err.message}`);
        res.end();
        isStreaming = false;
    });
});


function playNextSong() {
    if (currentSongIndex >= songQueue.length) {
        currentSongIndex = 0;
        isPlaying = false;
        return;
    }

    const songPath = songQueue[currentSongIndex]?.path;
    const songDuration = getAudioDuration(songPath);

    console.log(`Now playing: ${songQueue[currentSongIndex]?.name}`);
    currentTimestamp = 0;

    setTimeout(() => {
        currentSongIndex++;
        playNextSong();
    }, songDuration * 1000);
}

function getAudioDuration(filePath) {
    // Mock function; implement FFmpeg probe if needed
    return 180; // Assume 3 minutes for simplicity
}

// Web interface for uploads and queue
app.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
