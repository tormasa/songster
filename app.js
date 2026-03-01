function getRedirectUri() {
    const hostname = window.location.hostname;
    
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
        return 'http://127.0.0.1:5500';
    }
    
    return 'https://tormasa.github.io/songster/';
}

const REDIRECT_URI = getRedirectUri();
const CLIENT_ID = "0b2993e513404aff82e3a640a61ff627";

const loginBtn = document.getElementById('login-btn');
const gameUI = document.getElementById('game-ui');
const playButton = document.getElementById('play-random');
const revealButton = document.getElementById('reveal-song');
const nextSongButton = document.getElementById('next-song');
const songInfo = document.getElementById('song-info');
const songNameDisplay = document.getElementById('song-name');
const artistNameDisplay = document.getElementById('artist-name');
const albumInfoDisplay = document.getElementById('album-info');
const audioVisualizer = document.getElementById('audio-visualizer');

let player = null;
let currentTrackId = null;
let isPlayerReady = false;
let currentSongList = [];

playButton.addEventListener('click', async () => {
    if (!isPlayerReady)
        return alert("Spotify Player not ready yet!");

    // CASE 1: No song is loaded yet
    if (!currentTrackId) {
        await playRandomFromList();
        revealButton.style.display = 'block';
        songInfo.style.display = 'none';
    } 
    // CASE 2: A song exists, so we just toggle Play/Stop
    else {
        player.togglePlay();
    }
});

revealButton.addEventListener('click', async () => {
    await revealSong();
    revealButton.style.display = 'none';
    nextSongButton.style.display = 'block';
});

nextSongButton.addEventListener('click', async () => {
    await playRandomFromList();
    songInfo.style.display = 'none';
    nextSongButton.style.display = 'none';
    revealButton.style.display = 'block';
});

async function init() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const songListRaw = localStorage.getItem("currentSongList");
    if (songListRaw)
        currentSongList = JSON.parse(songListRaw);

    if (!code) {
        // STEP 1: Show Login Button if not authenticated
        loginBtn.style.display = 'block';
        loginBtn.addEventListener('click', () => redirectToAuthCodeFlow());
    } else {
        // STEP 2: We just returned from Spotify. Exchange code for token.
        await getToken(code);
        
        // Clean the URL so the ?code= doesn't stay in the address bar
        window.history.replaceState({}, document.title, "/");
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.body.appendChild(script);
        window.onSpotifyWebPlaybackSDKReady = () => {
            initializePlayer();
        };
        
        showGame();
    }
}

function showGame() {
    const token = localStorage.getItem('access_token');
    loginBtn.style.display = 'none';
    gameUI.style.display = 'block';
    console.log("Access Token Ready:", token);
    // Now you can fetch songs using the token!
}

// Helper: Exchange Auth Code for Access Token
async function redirectToAuthCodeFlow() {
    const generateRandomString = (length) => {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return values.reduce((acc, x) => acc + possible[x % possible.length], "");
    };
    const codeVerifier = generateRandomString(64);
    const sha256 = async (plain) => {
        const encoder = new TextEncoder()
        const data = encoder.encode(plain)
        return window.crypto.subtle.digest('SHA-256', data)
    };
    const base64encode = (input) => {
        return btoa(String.fromCharCode(...new Uint8Array(input)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    };
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);
    const scope = 'user-read-private user-read-email streaming user-modify-playback-state user-read-playback-state playlist-read-private';
    const authUrl = new URL("https://accounts.spotify.com/authorize");
    window.localStorage.setItem('code_verifier', codeVerifier);
    const params =  {
        response_type: 'code',
        client_id: CLIENT_ID,
        scope,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: REDIRECT_URI,
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
}

const getToken = async code => {
    // stored in the previous step
    const codeVerifier = localStorage.getItem('code_verifier');

    const url = "https://accounts.spotify.com/api/token";
    const payload = {
        method: 'POST',
        headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
        }),
    }

    const body = await fetch(url, payload);
    const response = await body.json();

    localStorage.setItem('access_token', response.access_token);
}

let currentDeviceId;

function initializePlayer() {
    const token = localStorage.getItem('access_token');
    player = new Spotify.Player({
        name: 'Songster',
        getOAuthToken: cb => { cb(token); }, // Use the token you just got
        volume: 0.5
    });

    player.addListener('ready', ({ device_id }) => {
        console.log('Ready with Device ID', device_id);
        // To play a song, you send a PUT request to Spotify's 'play' endpoint
        // passing this device_id.
        currentDeviceId = device_id;
        isPlayerReady = true;
    });

    player.addListener('authentication_error', ({ message }) => {
        console.error('Failed to authenticate', message);
        localStorage.removeItem('access_token');
        window.location.reload(); // Force a re-login
    });

    player.addListener('player_state_changed', state => {
        if (!state)
            return;

        const isPaused = state.paused;
        const hasFinished = state.position === 0 && isPaused && state.restrictions.disallow_resuming_reasons;

        if (isPaused) {
            playButton.textContent = "Play";
            playButton.classList.remove('playing');
            audioVisualizer.classList.remove('playing');
        } else {
            playButton.textContent = "Stop";
            playButton.classList.add('playing');
            audioVisualizer.classList.add('playing');
        }

        // Logic for when the song ends naturally: Reset so the next click loads a new song
        if (hasFinished) {
            currentTrackId = null;
        }
    });

    player.connect();
};

// This function triggers a specific song on YOUR browser player
async function playSong(trackUri) {
    if (!currentDeviceId)
        return console.error("Player not ready!");

    const accessToken = localStorage.getItem("access_token");
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${currentDeviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [trackUri] }),
        headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
        },
    });
}

async function playRandomFromList() {
    try {
        console.log("songs remaining on current song list: ", currentSongList.length);
        if (currentSongList.length == 0) {
            // 1. Fetch the local JSON file
            // Construct the correct path for GitHub Pages and local development
            const basePath = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
            const jsonPath = `${basePath}/songs.json`;
            const response = await fetch(jsonPath);
            const songList = await response.json();
            currentSongList = songList.map(s => s.id);
        }

        // 2. Pick a random index
        const randomIndex = Math.floor(Math.random() * currentSongList.length);
        currentTrackId = currentSongList[randomIndex];
        currentSongList.splice(randomIndex, 1);
        localStorage.setItem("currentSongList", JSON.stringify(currentSongList));

        console.log(`Now playing: ${currentTrackId}`);

        // 3. Convert ID to Spotify URI and play
        const trackUri = `spotify:track:${currentTrackId}`;
        playSong(trackUri); 

    } catch (error) {
        console.error("Error loading song list:", error);
    }
}

async function revealSong() {
    try {
        const accessToken = localStorage.getItem("access_token");
        const response = await fetch(`https://api.spotify.com/v1/tracks/${currentTrackId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const trackData = await response.json();
        const trackName = trackData.name;
        const artistName = trackData.artists.map(artist => artist.name).join(', ');
        const albumName = trackData.album.name;
        const releaseYear = trackData.album.release_date.split('-')[0];

        songNameDisplay.textContent = trackName;
        albumInfoDisplay.textContent = `${albumName} (${releaseYear}) ${trackData.album.album_type == 'compilation' ? "[compilation]" : ""}`;
        artistNameDisplay.textContent = artistName;
        songInfo.style.display = 'block';
    } catch (error) {
        console.error("Error fetching track info:", error);
    }
}

async function playNextSong() {
    await playRandomFromList();
    songInfo.style.display = 'none';
    nextSongButton.style.display = 'none';
    revealButton.style.display = 'block';
}

// Start the app
init();