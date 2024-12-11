from flask import Flask, request, Response
import os
import requests
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
def main_menu():
    """
    Main menu with options to play music, upload music, or scan for new music.
    """
    menu_text = """
    <h1>Welcome to MTS Radio!!!</h1>
    <hr>
    <p>1) <a href="/menu/play">Play Music</a> (-> takes us to our music menu to select songs or play random)</p>
    <p>2) <a href="/menu/upload">Upload Music</a> (-> allows us to upload a song by downloading it from a URL directly)</p>
    <p>3) <a href="/menu/scan">Scan For New Music</a></p>
    <hr>
    """
    return menu_text


@app.route("/menu/play")
def play_menu():
    """
    Music menu to select a song or play randomly.
    """
    songs = get_song_list()
    menu_text = "<h2>Music Menu</h2><hr>"
    for i, song in enumerate(songs, 1):
        menu_text += f"<p>{i}) <a href='/play/{i}'>{song['title']} - {song['artist']}</a></p>"
    menu_text += "<p>R) <a href='/play/random'>Random Cycle</a></p>"
    menu_text += "<hr><p><a href='/'>Back to Main Menu</a></p>"
    return menu_text


@app.route("/menu/upload")
def upload_menu():
    """
    Menu to upload music via a direct URL.
    """
    upload_form = """
    <h2>Upload Music</h2><hr>
    <form action="/upload" method="post">
        <label for="url">Enter MP3 URL:</label><br>
        <input type="url" id="url" name="url" required style="width: 300px;"><br><br>
        <button type="submit">Upload</button>
    </form>
    <hr>
    <p><a href='/'>Back to Main Menu</a></p>
    """
    return upload_form


@app.route("/upload", methods=["POST"])
def upload_music():
    """
    Handles downloading an MP3 from a given URL and saving it to the directory.
    """
    url = request.form.get("url")
    if not url or not url.endswith(".mp3"):
        return "Invalid URL. Please provide a valid MP3 URL.", 400

    try:
        response = requests.get(url, stream=True)
        if response.status_code == 200:
            filename = url.split("/")[-1]
            file_path = os.path.join(MP3_DIR, filename)
            with open(file_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk:
                        f.write(chunk)
            return f"Music uploaded successfully: {filename}<br><a href='/'>Back to Main Menu</a>"
        else:
            return "Failed to download the file. Please check the URL.", 400
    except Exception as e:
        return f"An error occurred: {str(e)}", 500


@app.route("/menu/scan")
def scan_menu():
    """
    Scans the directory for new music and displays the updated list.
    """
    songs = get_song_list()
    menu_text = "<h2>Scan Complete! Here is the updated list:</h2><hr>"
    for i, song in enumerate(songs, 1):
        menu_text += f"<p>{i}) {song['title']} - {song['artist']}</p>"
    menu_text += "<hr><p><a href='/'>Back to Main Menu</a></p>"
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
