export default async function handler(req, res) {
    // Allow your GitHub Pages site to call this API
    res.setHeader('Access-Control-Allow-Origin', 'https://tormasa.github.io');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // Handle browser 'preflight' checks
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const API_KEY = process.env.MUSIC_API_KEY; // We will set this in Step 4

    try {
        const response = await fetch(`https://api.music-service.com/data?key=${API_KEY}`);
        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch music data' });
    }
}