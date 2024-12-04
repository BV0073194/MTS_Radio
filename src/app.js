const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const streamer = require("./streamer");

const app = express();
const PORT = process.env.PORT || 8000;

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// Serve admin interface at `/admin`
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/admin.html"));
});

// Parse JSON requests
app.use(express.json());

// Stream endpoint
app.get("/stream.mp3", (req, res) => {
    streamer.streamAudio(req, res);
});

// Configure Multer to store files in ./public/uploads
const upload = multer({
    dest: path.join(__dirname, "../public/uploads"),
});

// File upload endpoint
app.post("/upload", upload.single("audio"), (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).send("No file uploaded.");
    }

    // Resolve relative path for storage
    const relativePath = `./public/uploads/${Date.now()}-${file.originalname}`;
    const absolutePath = path.resolve(relativePath);

    // Rename file to include timestamp and maintain relative path
    fs.rename(file.path, absolutePath, (err) => {
        if (err) {
            console.error("[ERROR] Failed to rename uploaded file:", err);
            return res.status(500).send("Error processing file upload.");
        }

        // Enqueue the relative path for playback
        global.audioQueue.push(relativePath);
        console.log(`[INFO] File uploaded and added to queue: ${relativePath}`);
        res.status(200).send("File uploaded and added to the queue.");
    });
});

// Admin routes
app.get("/admin/files", (req, res) => {
    const filesDir = path.join(__dirname, "../public/uploads");
    fs.readdir(filesDir, (err, files) => {
        if (err) {
            console.error("[ERROR] Unable to read files:", err);
            return res.status(500).send("Unable to fetch files.");
        }
        res.json(files.map((file) => path.join(filesDir, file)));
    });
});

app.get("/admin/queue", (req, res) => {
    res.json(global.audioQueue);
});

app.post("/admin/play-now", (req, res) => {
    const { file } = req.body;

    if (!file || !fs.existsSync(file)) {
        return res.status(400).send("Invalid file.");
    }

    // Play immediately
    global.audioQueue.unshift(file); // Add the file to the front of the queue
    console.log(`[INFO] Playing immediately: ${file}`);
    res.status(200).send("File added to play immediately.");
});

app.post("/admin/clear-queue", (req, res) => {
    global.audioQueue = [];
    console.log("[INFO] Queue cleared.");
    res.status(200).send("Queue cleared.");
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});
