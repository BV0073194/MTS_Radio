from flask import Flask, Response, request
import os
import random
import requests
import threading
import time
from pyngrok import ngrok

def get_song_list():
    """Reads the MP3 files and extracts song titles and artists from filenames."""
    songs = []
    for filename in os.listdir(MP3_DIR):
        if filename.endswith(".mp3"):
            parts = filename[:-4].split(" - ", 1)  # Remove '.mp3' and split artist/title
            artist = parts[0] if len(parts) > 1 else "Unknown Artist"
            title = parts[1] if len(parts) > 1 else filename[:-4]
            songs.append({"filename": filename, "artist": artist, "title": title})
    return songs

def download_music(url):
    """Downloads a music file from a direct URL."""
    try:
        response = requests.get(url, stream=True)
        if response.status_code == 200 and 'content-type' in response.headers and 'audio' in response.headers['content-type']:
            filename = os.path.basename(url.split("?")[0])  # Extract filename from URL
            if not filename.endswith(".mp3"):
                filename += ".mp3"
            filepath = os.path.join(MP3_DIR, filename)
            with open(filepath, "wb") as f:
                for chunk in response.iter_content(chunk_size=1024):
                    f.write(chunk)
            print(f"Downloaded: {filename}")
        else:
            print("Failed to download: Invalid URL or not an audio file.")
    except Exception as e:
        print(f"Error downloading file: {e}")

def cli_menu():
    """Displays the CLI menu and handles user interaction."""
    while True:
        print("""
 Welcome to MTS Radio!!!
-------------------------------

1) Play Music (-> takes us to our music menu to select songs or play random)
2) Upload Music (-> allows us to upload a song by downloading it from the URL directly)
3) Scan For New Music

-------------------------------
""")
        choice = input("Choose an option: ")

        if choice == "1":
            print("\nAvailable Songs:")
            songs = get_song_list()
            for i, song in enumerate(songs, 1):
                print(f"{i}) {song['title']} - {song['artist']}")
            print("R) Random Cycle")
            song_choice = input("Enter the song number or 'R' for random: ")
            if song_choice.lower() == "r":
                print("Starting random cycle...")
                current_stream["choice"] = "random"
                current_stream["start_time"] = time.time()
            elif song_choice.isdigit() and 1 <= int(song_choice) <= len(songs):
                selected_song = songs[int(song_choice) - 1]
                print(f"Playing: {selected_song['title']} - {selected_song['artist']}")
                current_stream["choice"] = selected_song['filename']
                current_stream["start_time"] = time.time()
            else:
                print("Invalid choice.")

        elif choice == "2":
            url = input("Enter the URL of the music file: ")
            download_music(url)

        elif choice == "3":
            print("Scanning for new music...")
            print(f"Found {len(get_song_list())} songs in the library.")

        else:
            print("Invalid choice. Please try again.")

# Flask server for streaming
app = Flask(__name__)
MP3_DIR = "./mp3_files"
if not os.path.exists(MP3_DIR):
    os.makedirs(MP3_DIR)

current_stream = {"choice": None, "start_time": None}  # Stores the current song and playback start time

@app.route("/stream.mp3")
def stream():
    """Streams music based on the current selection and syncs playback."""
    def generate():
        while True:
            songs = get_song_list()
            if not songs:
                yield b"No songs available."
                break

            if current_stream["choice"]:
                if current_stream["choice"] == "random":
                    song = random.choice(songs)
                else:
                    song = next((s for s in songs if s['filename'] == current_stream["choice"]), None)
                if not song:
                    continue

                file_path = os.path.join(MP3_DIR, song["filename"])
                start_time = current_stream["start_time"]
                elapsed_time = time.time() - start_time if start_time else 0

                with open(file_path, "rb") as f:
                    f.seek(int(elapsed_time * 128000 / 8), os.SEEK_SET)  # Estimate byte offset for elapsed time
                    yield from f

    return Response(generate(), mimetype="audio/mpeg")

# Start the Flask server with ngrok
def start_server_with_ngrok():
    public_url = ngrok.connect(5000)
    print(f"ngrok public URL: {public_url}")
    app.run(host="0.0.0.0", port=5000)

server_thread = threading.Thread(target=start_server_with_ngrok)
server_thread.daemon = True
server_thread.start()

# Start the CLI menu
cli_menu()
