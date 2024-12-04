const fs = require("fs");
const path = require("path");

global.audioQueue = [];

let currentStream = null;
let listeners = [];
const BUFFER_SIZE = 100; // Number of chunks to keep in the buffer
const audioBuffer = [];

// Path to the static noise file
const staticNoisePath = path.join(__dirname, "../public/static-noise.mp3");

// Buffer the static noise file into memory
const staticNoiseBuffer = fs.readFileSync(staticNoisePath);
const STATIC_NOISE_CHUNK_SIZE = 4096; // Size of each chunk to broadcast
let staticOffset = 0;

// Start the continuous stream loop
const startStreamLoop = () => {
    if (!currentStream) {
        if (global.audioQueue.length > 0) {
            playNextAudio();
        } else {
            playStaticNoise();
        }
    }

    setTimeout(startStreamLoop, 100); // Continuously check every 100ms
};

// Stream audio to a new listener
const streamAudio = (req, res) => {
    res.set({
        "Content-Type": "audio/mpeg",
        "Connection": "keep-alive",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked", // Required for continuous streaming
        "icy-name": "Custom Radio Station", // Optional: Set a stream name
        "icy-genre": "Various", // Optional: Set the genre
    });

    console.log("New listener connected to the stream.");

    // Send buffered audio to the new listener
    audioBuffer.forEach((chunk) => res.write(chunk));

    // Add listener to the active list
    listeners.push(res);

    // Remove listener on disconnect
    req.on("close", () => {
        console.log("Listener disconnected.");
        listeners = listeners.filter((listener) => listener !== res);
    });
};

// Play the next audio file in the queue
const playNextAudio = () => {
    if (global.audioQueue.length > 0) {
        const nextAudioPath = global.audioQueue.shift();
        currentStream = fs.createReadStream(nextAudioPath);

        currentStream.on("data", (chunk) => {
            bufferAudio(chunk); // Add to buffer
            broadcast(chunk); // Send to listeners
        });

        currentStream.on("end", () => {
            currentStream = null;
            playNextAudio();
        });

        currentStream.on("error", (err) => {
            console.error("Error playing audio:", err);
            currentStream = null;
            playNextAudio();
        });
    } else {
        playStaticNoise(); // Switch to static noise if the queue is empty
    }
};

// Continuously play static noise in a seamless loop
const playStaticNoise = () => {
    // Generate a chunk of static noise
    const chunk = staticNoiseBuffer.slice(staticOffset, staticOffset + STATIC_NOISE_CHUNK_SIZE);

    // Broadcast and buffer the chunk
    bufferAudio(chunk);
    broadcast(chunk);

    // Update the offset or reset if the end of the noise file is reached
    staticOffset += STATIC_NOISE_CHUNK_SIZE;
    if (staticOffset >= staticNoiseBuffer.length) {
        staticOffset = 0; // Loop back to the beginning
    }

    // Schedule the next chunk
    setImmediate(playStaticNoise);
};

// Buffer audio chunks for new listeners to catch up
const bufferAudio = (chunk) => {
    audioBuffer.push(chunk);
    if (audioBuffer.length > BUFFER_SIZE) {
        audioBuffer.shift(); // Keep buffer size within the limit
    }
};

// Broadcast audio chunks to all connected listeners
const broadcast = (chunk) => {
    listeners.forEach((listener) => {
        listener.write(chunk);
    });
};

startStreamLoop();

module.exports = { streamAudio };