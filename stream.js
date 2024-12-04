import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

// Song queue
let songQueue = [];
let isStreaming = false;

// Add song to queue
export function addSongToQueue(songPath) {
    songQueue.push(songPath);
    console.log(`Added to queue: ${songPath}`);
}

// Remove song from queue
export function removeFromQueue(index) {
    if (index < 0 || index >= songQueue.length) {
        console.error("Invalid index. No song removed.");
        return;
    }
    const removed = songQueue.splice(index, 1)[0];
    console.log(`Removed from queue: ${removed}`);

    // Remove the file from the filesystem if it's in the uploads folder
    if (removed.startsWith("uploads/")) {
        fs.unlink(removed, err => {
            if (err) console.error(`Failed to delete file: ${err.message}`);
        });
    }
}

// List the current queue
export function listQueue() {
    return songQueue.map((song, index) => ({
        index,
        song,
    }));
}

// Stream songs in queue
export function streamSongs(req, res) {
    if (songQueue.length === 0) {
        res.status(200).send("No songs in the queue.");
        return;
    }

    if (isStreaming) {
        res.status(400).send("A stream is already in progress.");
        return;
    }

    isStreaming = true;
    let currentSongIndex = 0;

    const playNextSong = () => {
        if (currentSongIndex >= songQueue.length) {
            currentSongIndex = 0; // Loop back to the first song
        }

        const currentSong = songQueue[currentSongIndex];
        console.log(`Streaming: ${currentSong}`);

        const ffmpegStream = ffmpeg(currentSong)
            .audioCodec("libmp3lame")
            .format("mp3")
            .on("end", () => {
                currentSongIndex++;
                playNextSong();
            })
            .on("error", err => {
                console.error(`Error streaming song: ${err.message}`);
                isStreaming = false;
                res.end();
            });

        ffmpegStream.pipe(res, { end: false });
    };

    res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
    });
    playNextSong();
}
