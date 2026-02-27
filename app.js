const REDIRECT_URI = 'http://127.0.0.1:5500'; // Match your local server port
const CLIENT_ID = "0b2993e513404aff82e3a640a61ff627";

const loginBtn = document.getElementById('login-btn');
const gameUI = document.getElementById('game-ui');

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
    // const verifier = localStorage.getItem("verifier");

    // const params = new URLSearchParams();
    // params.append("client_id", clientId);
    // params.append("grant_type", "authorization_code");
    // params.append("code", code);
    // params.append("redirect_uri", REDIRECT_URI);
    // params.append("code_verifier", verifier);

    // const result = await fetch("https://accounts.spotify.com/api/token", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //     body: params
    // });

    // const { access_token } = await result.json();
    // return access_token;
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
    const scope = 'user-read-private user-read-email';
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

// Start the app
init();