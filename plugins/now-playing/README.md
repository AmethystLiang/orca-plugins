# Now Playing

Control Spotify from Orca's right sidebar: see what's playing, skip, seek, like songs, search Spotify, start any playlist and move playback between your devices.

- **Player**: cover, song, artist and album, a seek bar, and shuffle, previous, play/pause, next and repeat. The heart saves the song to your Liked Songs. A soft wash from the cover's color sits behind the player.
- **Device chip**: the green chip under the song shows where it's playing. Click it to move playback to another device (your Mac, phone or a speaker) and to set the volume.
- **Search**: songs, artists, albums and playlists. Click a song to play it, or hover it and add it to the queue.
- **Playlists**: your playlists. Hover one and press play, or click it to see its songs.
- **Queue**: what plays next.

It is a remote: a Spotify app must be open somewhere (your Mac, phone or a speaker) to make the sound.

## Setup

You need Spotify **Premium** and a free Spotify developer app of your own. The panel walks you through this the first time.

1. Open [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and click **Create app**.
2. Add the redirect URI `http://127.0.0.1:8888/callback`. It must be `127.0.0.1`, not `localhost`.
3. Tick **Web API**, accept the terms and save.
4. Copy the **Client ID** from the app's settings and paste it into the panel (or Settings → Now Playing). You never need the client secret.
5. Click **Sign in with Spotify** and press **Agree** in your browser.

Spotify only lets accounts listed on your developer app use it, so each person makes their own.

## Permissions

It runs as a trusted worker, because it waits for Spotify's sign-in on `127.0.0.1:8888` and calls the Spotify Web API. It asks for:

- **Own storage** (`storage:own`): remembers which tab you had open.
- **Own settings** (`settings:own`): your Client ID.
- **Own secrets** (`secrets:own`): your Spotify sign-in token, in Orca's encrypted secrets file.

It signs in with PKCE, so there is no client secret. It talks only to `accounts.spotify.com`, `api.spotify.com` and Spotify's image hosts. **Sign out of Spotify** at the bottom of the panel deletes the token.

## Limits

- Spotify does not let new developer apps list the songs of its own editorial playlists (Discover Weekly, Spotify-made mixes). Their play button still works.
- Port 8888 must be free while you sign in.
