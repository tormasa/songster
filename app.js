const REDIRECT_URI = 'http://127.0.0.1:5500'; // Match your local server port
const CLIENT_ID = "0b2993e513404aff82e3a640a61ff627";

const loginBtn = document.getElementById('login-btn');
const gameUI = document.getElementById('game-ui');
const playButton = document.getElementById('play-random');

async function init() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

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
        playButton.addEventListener('click', () => playRandomFromList());
        
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
    const redirectUri = 'http://127.0.0.1:5500';
    const scope = 'user-read-private user-read-email streaming user-modify-playback-state user-read-playback-state';
    const authUrl = new URL("https://accounts.spotify.com/authorize");
    window.localStorage.setItem('code_verifier', codeVerifier);
    const params =  {
        response_type: 'code',
        client_id: CLIENT_ID,
        scope,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
    const urlParams = new URLSearchParams(window.location.search);
    let code = urlParams.get('code');
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
    const player = new Spotify.Player({
        name: 'Songster',
        getOAuthToken: cb => { cb(token); }, // Use the token you just got
        volume: 0.5
    });

    player.addListener('ready', ({ device_id }) => {
        console.log('Ready with Device ID', device_id);
        // To play a song, you send a PUT request to Spotify's 'play' endpoint
        // passing this device_id.
        currentDeviceId = device_id;
    });

    player.addListener('authentication_error', ({ message }) => {
        console.error('Failed to authenticate', message);
        localStorage.removeItem('access_token');
        window.location.reload(); // Force a re-login
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
        // 1. Fetch the local JSON file
        const response = await fetch('./songs.json');
        const songList = await response.json();

        // 2. Pick a random index
        const randomIndex = Math.floor(Math.random() * songList.length);
        const selectedSong = songList[randomIndex];

        console.log(`Now playing: ${selectedSong.url}`);
        const id = selectedSong.url.substring(selectedSong.url.indexOf('track/') + 6).split('?')[0];

        // 3. Convert ID to Spotify URI and play
        const trackUri = `spotify:track:${id}`;
        playSong(trackUri); 

    } catch (error) {
        console.error("Error loading song list:", error);
    }
}

// Start the app
init();