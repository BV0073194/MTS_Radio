from flask import Flask, Response
import os
import random

app = Flask(__name__)

# Directory where MP3 files are stored
MP3_DIR = "./mp3_files"
if not os.path.exists(MP3_DIR):
    os.makedirs(MP3_DIR)  # Create directory if it doesn't exist


def get_song_list():
    """
    Reads the MP3 files and extracts song titles and artists from filenames.
    Assumes filenames are formatted as "Artist - Title.mp3".
    """
    songs = []
    for filename in os.listdir(MP3_DIR):
        if filename.endswith(".mp3"):
            parts = filename[:-4].split(" - ", 1)  # Remove '.mp3' and split artist/title
            artist = parts[0] if len(parts) > 1 else "Unknown Artist"
            title = parts[1] if len(parts) > 1 else filename[:-4]
            songs.append({"filename": filename, "artist": artist, "title": title})
    return songs


@app.route("/")
def menu():
    """
    Display the menu with available songs and options.
    """
    songs = get_song_list()
    menu_text = "Internet Radio Menu:<br><br>"
    for i, song in enumerate(songs, 1):
        menu_text += f"{i}) {song['title']} - {song['artist']}<br>"
    menu_text += "<br>R) Random Cycle<br>"
    menu_text += "<br>Select a song number or 'R' to stream songs randomly: /play/<number> or /play/random"
    return menu_text


@app.route("/play/<choice>")
def play(choice):
    """
    Plays a selected song or randomly cycles through all songs.
    """
    songs = get_song_list()
    if choice.isdigit():
        choice = int(choice)
        if 1 <= choice <= len(songs):
            selected_song = songs[choice - 1]
            return stream_song(selected_song)
        else:
            return "Invalid song number. Please select a valid number from the menu.", 400
    elif choice.lower() == "random":
        return random_cycle(songs)
    else:
        return "Invalid choice. Please select a valid number or 'R' for random cycle.", 400


def stream_song(song):
    """
    Streams the selected song.
    """
    file_path = os.path.join(MP3_DIR, song["filename"])
    def generate():
        with open(file_path, "rb") as f:
            yield from f
    return Response(generate(), mimetype="audio/mpeg")


def random_cycle(songs):
    """
    Streams songs randomly in a loop.
    """
    def generate():
        while True:
            song = random.choice(songs)
            file_path = os.path.join(MP3_DIR, song["filename"])
            with open(file_path, "rb") as f:
                yield from f
    return Response(generate(), mimetype="audio/mpeg")


if __name__ == "__main__":
    print("Place your MP3 files in the 'mp3_files' folder.")
    app.run(host="0.0.0.0", port=5000)
