import express from "express";
import { streamSongs, addSongToQueue, listQueue, removeFromQueue } from "./stream.js";
import multer from "multer";

const app = express();
const PORT = 8000;

// Configure file uploads
const upload = multer({ dest: "uploads/" });

// Upload endpoint
app.post("/upload", upload.single("song"), (req, res) => {
    if (!req.file) {
        return res.status(400).send("No file uploaded.");
    }
    const songPath = `uploads/${req.file.filename}`;
    addSongToQueue(songPath);
    res.send(`Uploaded and added to queue: ${req.file.originalname}`);
});

// Streaming endpoint
app.get("/audio.mp3", streamSongs);

// Queue management API
app.get("/queue", (req, res) => res.json(listQueue()));
app.post("/queue/remove", (req, res) => {
    const index = parseInt(req.query.index, 10);
    if (isNaN(index)) return res.status(400).send("Invalid index.");
    removeFromQueue(index);
    res.send("Removed song from queue.");
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}/audio.mp3`);
});
