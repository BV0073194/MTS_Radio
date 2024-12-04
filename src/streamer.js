const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

global.audioQueue = [];

let listeners = [];
let currentSongStartTime = null; // Track when the current song starts
let currentSongDuration = 0; // Store the current song duration
let currentStreamSource = null; // Track the current source being read (song or static noise)
let isPlayingStatic = true; // Track whether we're playing static noise or a song
const BUFFER_SIZE = 50; // Adjusted buffer size to ensure sufficient buffering without overloading
const audioBuffer = []; // Circular buffer for recent audio chunks

// Path to the static noise file in ./public
const staticNoisePath = path.join(__dirname, "../public/static-noise.mp3");

// Ensure the static noise file exists
if (!fs.existsSync(staticNoisePath)) {
    console.error(`[ERROR] Static noise file not found at: ${staticNoisePath}`);
    process.exit(1);
}

// Read the static noise file into memory
const staticNoiseBuffer = fs.readFileSync(staticNoisePath);
const STATIC_NOISE_CHUNK_SIZE = 1024; // Optimal chunk size for lower latency
let staticOffset = 0;

const getCurrentTimestamp = () => {
    return new Date().toISOString();
};

// Start broadcasting either static noise or audio from the queue
const startBroadcasting = () => {
    if (!currentStreamSource) {
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

    // Send buffered audio to the new listener so they start hearing what's currently being played
    audioBuffer.forEach((chunk) => res.write(chunk));

    // Add the listener to the active list
    listeners.push(res);

    req.on("close", () => {
        console.log(`[${getCurrentTimestamp()}] [INFO] Listener disconnected.`);
        listeners = listeners.filter((listener) => listener !== res);
    });
};

// Play the next audio file in the queue without interrupting the stream
const playNextAudio = () => {
    if (global.audioQueue.length > 0) {
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
            console.log(`[${getCurrentTimestamp()}] [DEBUG] File duration: ${metadata.format.duration} seconds`);

            currentSongStartTime = Date.now();
            isPlayingStatic = false;

            currentStreamSource = fs.createReadStream(resolvedPath, { highWaterMark: 64 * 1024 });
            currentStreamSource.on("data", (chunk) => {
                bufferAudio(chunk);
                broadcast(chunk);
            });

            currentStreamSource.on("end", () => {
                console.log(`[${getCurrentTimestamp()}] [INFO] Song is over.`);
                currentStreamSource = null;

                // Delete the file after it has finished playing
                fs.unlink(resolvedPath, (err) => {
                    if (err) {
                        console.error(`[${getCurrentTimestamp()}] [ERROR] Failed to delete file ${resolvedPath}:`, err);
                    } else {
                        console.log(`[${getCurrentTimestamp()}] [INFO] Deleted file: ${resolvedPath}`);
                    }
                });

                if (global.audioQueue.length > 0) {
                    playNextAudio();
                } else {
                    playStaticNoise();
                }
            });

            currentStreamSource.on("error", (err) => {
                console.error(`[${getCurrentTimestamp()}] [ERROR] Streaming error: ${err.message}`);
                currentStreamSource = null;
                playStaticNoise();
            });
        });
    } else {
        playStaticNoise();
    }
};

// Continuously play static noise in a seamless loop
const playStaticNoise = () => {
    if (isPlayingStatic && currentStreamSource) {
        console.log("[DEBUG] Static noise already playing.");
        return;
    }

    console.log(`[${getCurrentTimestamp()}] [INFO] Starting static noise.`);

    isPlayingStatic = true;

    const broadcastStatic = () => {
        if (!isPlayingStatic) return;

        const chunk = staticNoiseBuffer.slice(staticOffset, staticOffset + STATIC_NOISE_CHUNK_SIZE);
        bufferAudio(chunk);
        broadcast(chunk);

        staticOffset += STATIC_NOISE_CHUNK_SIZE;
        if (staticOffset >= staticNoiseBuffer.length) {
            staticOffset = 0;
        }

        setImmediate(broadcastStatic);
    };

    broadcastStatic();
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

    if (isPlayingStatic) {
        playNextAudio();
    }
};

// Start the broadcaster (only needs to be called once)
console.log(`[${getCurrentTimestamp()}] [INFO] Starting the broadcasting service.`);
startBroadcasting();

module.exports = { streamAudio, addToQueueAndPlay };