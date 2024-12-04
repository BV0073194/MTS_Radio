const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

global.audioQueue = [];

let listeners = [];
let currentSongStartTime = null;
let currentSongDuration = 0;
let staticNoiseInterval = null;
let currentSource = null;
let currentAudioType = null; // Track the current type of audio being played
const BUFFER_SIZE = 50; // Adjusted buffer size for sufficient buffering without overloading
const audioBuffer = [];

// Path to the static noise file in ./public
const staticNoisePath = path.join(__dirname, "../public/static-noise.mp3");

if (!fs.existsSync(staticNoisePath)) {
    console.error(`[ERROR] Static noise file not found at: ${staticNoisePath}`);
    process.exit(1);
}

const staticNoiseBuffer = fs.readFileSync(staticNoisePath);
const STATIC_NOISE_CHUNK_SIZE = 1024;
let staticOffset = 0;

const getCurrentTimestamp = () => {
    return new Date().toISOString();
};

// Start broadcasting either static noise or audio from the queue
const startBroadcasting = () => {
    if (!currentSource && !staticNoiseInterval) {
        if (global.audioQueue.length > 0) {
            playNextAudio();
        } else {
            playStaticNoise();
        }
    }
};

// Stream audio to a new listener
const streamAudio = (req, res) => {
    res.set({
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Connection": "keep-alive",
        "Transfer-Encoding": "chunked",
        "icy-name": "Live Stream",
        "icy-genre": "Various",
    });

    console.log(`[${getCurrentTimestamp()}] [INFO] New listener connected.`);

    audioBuffer.forEach((chunk) => res.write(chunk));

    listeners.push(res);

    req.on("close", () => {
        console.log(`[${getCurrentTimestamp()}] [INFO] Listener disconnected.`);
        listeners = listeners.filter((listener) => listener !== res);
    });
};

// Play the next audio file in the queue
const playNextAudio = () => {
    if (global.audioQueue.length > 0) {
        stopCurrentSource();

        const nextAudioPath = global.audioQueue.shift();
        const resolvedPath = path.resolve(nextAudioPath);
        console.log(`[${getCurrentTimestamp()}] [INFO] Now playing: ${resolvedPath}`);

        if (!fs.existsSync(resolvedPath)) {
            console.error(`[${getCurrentTimestamp()}] [ERROR] File not found: ${resolvedPath}`);
            playStaticNoise();
            return;
        }

        ffmpeg.ffprobe(resolvedPath, (err, metadata) => {
            if (err) {
                console.error(`[${getCurrentTimestamp()}] [ERROR] Error retrieving metadata for ${resolvedPath}:`, err);
                playStaticNoise();
                return;
            }

            currentSongDuration = metadata.format.duration * 1000;
            currentSongStartTime = Date.now();
            currentAudioType = "song";

            currentSource = fs.createReadStream(resolvedPath, { highWaterMark: 64 * 1024 });

            currentSource.on("data", (chunk) => {
                bufferAudio(chunk);
                broadcast(chunk);
            });

            currentSource.on("error", (err) => {
                console.error(`[${getCurrentTimestamp()}] [ERROR] Streaming error: ${err.message}`);
                stopCurrentSource();
                playStaticNoise();
            });

            setTimeout(() => {
                console.log(`[${getCurrentTimestamp()}] [INFO] Song is over.`);

                fs.unlink(resolvedPath, (err) => {
                    if (err) {
                        console.error(`[${getCurrentTimestamp()}] [ERROR] Failed to delete file ${resolvedPath}:`, err);
                    } else {
                        console.log(`[${getCurrentTimestamp()}] [INFO] Deleted file: ${resolvedPath}`);
                    }
                });

                stopCurrentSource();
                if (global.audioQueue.length > 0) {
                    playNextAudio();
                } else {
                    playStaticNoise();
                }
            }, currentSongDuration);
        });
    } else {
        playStaticNoise();
    }
};

// Stop the current audio source
const stopCurrentSource = () => {
    if (currentSource && typeof currentSource.destroy === "function") {
        currentSource.destroy();
        currentSource = null;
    }
    if (staticNoiseInterval) {
        clearInterval(staticNoiseInterval);
        staticNoiseInterval = null;
    }
    currentAudioType = null;
};

// Continuously play static noise in a seamless loop
const playStaticNoise = () => {
    if (currentSource || staticNoiseInterval) {
        console.log("[DEBUG] Current stream is active, skipping static noise.");
        return;
    }

    currentAudioType = "static";

    staticNoiseInterval = setInterval(() => {
        if (global.audioQueue.length > 0) {
            stopCurrentSource();
            playNextAudio();
            return;
        }

        const chunk = staticNoiseBuffer.slice(staticOffset, staticOffset + STATIC_NOISE_CHUNK_SIZE);
        bufferAudio(chunk);
        broadcast(chunk);

        staticOffset += STATIC_NOISE_CHUNK_SIZE;
        if (staticOffset >= staticNoiseBuffer.length) {
            staticOffset = 0;
        }
    }, 100);
};

// Buffer audio chunks for new listeners to catch up
const bufferAudio = (chunk) => {
    audioBuffer.push(chunk);
    if (audioBuffer.length > BUFFER_SIZE) {
        audioBuffer.shift();
    }
};

// Broadcast audio chunks to all connected listeners
const broadcast = (chunk) => {
    listeners.forEach((listener) => {
        try {
            listener.write(chunk);
        } catch (err) {
            console.error(`[${getCurrentTimestamp()}] [ERROR] Error writing to listener:`, err);
        }
    });
};

// Function to add a new song to the queue and play immediately if required
const addToQueueAndPlay = (filePath) => {
    global.audioQueue.push(filePath);
    console.log(`[${getCurrentTimestamp()}] [INFO] Added to queue: ${filePath}`);

    if (!currentSource && !staticNoiseInterval) {
        playNextAudio();
    }
};

// Start the broadcaster (only needs to be called once)
console.log(`[${getCurrentTimestamp()}] [INFO] Starting the broadcasting service.`);
startBroadcasting();

module.exports = { streamAudio, addToQueueAndPlay };
