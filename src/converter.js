const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

const convertToMp3 = (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat("mp3")
            .on("end", () => resolve(outputPath))
            .on("error", (err) => reject(err))
            .save(outputPath);
    });
};

module.exports = { convertToMp3 };