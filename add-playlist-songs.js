const fs = require('fs');
const https = require('https');

// Get playlist URL from command line argument
const playlistUrl = process.argv[3] || 'https://open.spotify.com/playlist/5LBuCGF7hlRIh51rt7OB0m?si=29a00b33abb34a6f';
const playlistId = playlistUrl.split('/playlist/')[1].split('?')[0];

// You need to provide an access token
const accessToken = process.argv[2];

if (!accessToken) {
    console.error('Usage: node add-playlist-songs.js <access_token> [playlist_url]');
    console.error('\nTo get access token:');
    console.error('1. Open http://127.0.0.1:5500 (or your app)');
    console.error('2. Login with Spotify');
    console.error('3. Open browser DevTools (F12) → Console');
    console.error('4. Paste: localStorage.getItem("access_token")');
    console.error('5. Copy the token');
    console.error('\nExample:');
    console.error('  node add-playlist-songs.js "your_token" "https://open.spotify.com/playlist/..."');
    process.exit(1);
}

function makeSpotifyRequest(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.spotify.com',
            port: 443,
            path: endpoint,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        };

        https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    
                    if (res.statusCode !== 200) {
                        reject(new Error(`Spotify API Error (${res.statusCode}): ${parsed.error?.message || JSON.stringify(parsed)}`));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}`));
                }
            });
        }).on('error', (e) => {
            reject(e);
        }).end();
    });
}

async function getAllTracks() {
    let allTracks = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        console.log(`Fetching tracks (offset: ${offset})...`);
        const endpoint = `/v1/playlists/${playlistId}/items?offset=${offset}&limit=50`;
        console.log("endpoint", endpoint);
        
        try {
            const response = await makeSpotifyRequest(endpoint);
            console.log("response", response);
            
            if (response.items && Array.isArray(response.items)) {
                const trackIds = response.items.map(item => item.item.id);
                
                allTracks = allTracks.concat(trackIds);
                
                hasMore = response.next !== null;
                offset += response.items.length;
                
                console.log(`  Got ${trackIds.length} tracks (total so far: ${allTracks.length})`);
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`Error fetching tracks at offset ${offset}:`, error.message);
            throw error;
        }
    }

    return allTracks;
}

async function main() {
    try {
        console.log(`Fetching all tracks from playlist: ${playlistUrl}\n`);
        const tracks = await getAllTracks();
        
        console.log(`\nFetched ${tracks.length} total tracks from playlist`);
        
        if (tracks.length === 0) {
            console.error('No tracks found in playlist!');
            process.exit(1);
        }
        
        // Load existing songs
        const existingData = JSON.parse(fs.readFileSync('songs.json', 'utf8'));
        console.log(`Found ${existingData.length} existing songs in songs.json`);
        
        // Merge: add new tracks that aren't already in the file
        const existingIds = new Set(existingData.map(song => song.id));
        const newTracks = tracks.filter(track => !existingIds.has(track.id));
        
        const combined = [...existingData, ...newTracks];
        
        // Save
        fs.writeFileSync('songs.json', JSON.stringify(combined, null, 2));
        
        console.log(`\n✓ Added ${newTracks.length} new tracks`);
        console.log(`✓ Total tracks in songs.json: ${combined.length}`);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
