const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

global.audioQueue = [];

let listeners = [];
let currentSongStartTime = null; // Track when the current song starts
let currentSongDuration = 0; // Store the current song duration
let staticNoiseInterval = null; // Track the static noise broadcasting interval
let currentSource = null; // Track the current playing source (song or static noise)
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

// Function to get the current timestamp for logging
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
        "Transfer-Encoding": "chunked", // Continuous streaming
        "icy-name": "Live Stream",
        "icy-genre": "Various",
    });

    console.log(`[${getCurrentTimestamp()}] [INFO] New listener connected.`);

    // Send buffered audio to the new listener so they start hearing what's currently being played
    audioBuffer.forEach((chunk) => res.write(chunk));

    // Add the listener to the active list
    listeners.push(res);

    // Remove listener on disconnect
    req.on("close", () => {
        console.log(`[${getCurrentTimestamp()}] [INFO] Listener disconnected.`);
        listeners = listeners.filter((listener) => listener !== res);
    });
};

// Play the next audio file in the queue, seamlessly transitioning from static or other songs
const playNextAudio = () => {
    if (global.audioQueue.length > 0) {
        stopCurrentSource(); // Stop whatever is currently playing

        const nextAudioPath = global.audioQueue.shift();
        const resolvedPath = path.resolve(nextAudioPath);
        console.log(`[${getCurrentTimestamp()}] [INFO] Now playing: ${resolvedPath}`);

        if (!fs.existsSync(resolvedPath)) {
            console.error(`[${getCurrentTimestamp()}] [ERROR] File not found: ${resolvedPath}`);
            playStaticNoise();
            return;
        }

        // Get the duration of the audio file using ffmpeg
        ffmpeg.ffprobe(resolvedPath, (err, metadata) => {
            if (err) {
                console.error(`[${getCurrentTimestamp()}] [ERROR] Error retrieving metadata for ${resolvedPath}:`, err);
                playStaticNoise();
                return;
            }

            currentSongDuration = metadata.format.duration * 1000; // Convert duration to milliseconds
            console.log(`[${getCurrentTimestamp()}] [DEBUG] File duration: ${metadata.format.duration} seconds`);

            // Set the start time when the song actually starts playing
            currentSongStartTime = Date.now();

            currentSource = fs.createReadStream(resolvedPath, { highWaterMark: 64 * 1024 }); // Increased highWaterMark to 64KB

            currentSource.on("data", (chunk) => {
                bufferAudio(chunk);
                broadcast(chunk);
            });

            currentSource.on("error", (err) => {
                console.error(`[${getCurrentTimestamp()}] [ERROR] Streaming error: ${err.message}`);
                stopCurrentSource();
                playStaticNoise(); // Fallback to static noise on error
            });

            // Custom checker to determine if the song has finished playing based on elapsed time
            setTimeout(() => {
                console.log(`[${getCurrentTimestamp()}] [INFO] Song is over, elapsed time reached.`);

                // Delete the file after it has finished playing
                fs.unlink(resolvedPath, (err) => {
                    if (err) {
                        console.error(`[${getCurrentTimestamp()}] [ERROR] Failed to delete file ${resolvedPath}:`, err);
                    } else {
                        console.log(`[${getCurrentTimestamp()}] [INFO] Deleted file: ${resolvedPath}`);
                    }
                });

                stopCurrentSource();
                // Play the next song in the queue or fallback to static noise
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

// Stop current audio source (either static or song)
const stopCurrentSource = () => {
    if (currentSource && typeof currentSource.destroy === "function") {
        currentSource.destroy(); // Stop current stream if it's a readable stream
        currentSource = null;
    }
    if (staticNoiseInterval) {
        clearInterval(staticNoiseInterval); // Clear interval if it's for static noise
        staticNoiseInterval = null;
    }
};

// Continuously play static noise in a seamless loop with a regular interval
const playStaticNoise = () => {
    if (currentSource || staticNoiseInterval) {
        console.log("[DEBUG] Current stream is active, skipping static noise.");
        return; // Avoid interrupting if something is already streaming
    }

    staticNoiseInterval = setInterval(() => {
        if (global.audioQueue.length > 0) {
            stopCurrentSource();
            playNextAudio(); // Interrupt static noise if a new song is added
            return;
        }

        const chunk = staticNoiseBuffer.slice(staticOffset, staticOffset + STATIC_NOISE_CHUNK_SIZE);
        bufferAudio(chunk);
        broadcast(chunk);

        staticOffset += STATIC_NOISE_CHUNK_SIZE;
        if (staticOffset >= staticNoiseBuffer.length) {
            staticOffset = 0; // Loop back to the start
        }
    }, 100); // Consistent interval of 100ms to keep the stream active
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

    // Always play the next song immediately when it's added
    if (!currentSource && !staticNoiseInterval) {
        playNextAudio();
    }
};

// Start the broadcaster (only needs to be called once)
console.log(`[${getCurrentTimestamp()}] [INFO] Starting the broadcasting service.`);
startBroadcasting();

module.exports = { streamAudio, addToQueueAndPlay };