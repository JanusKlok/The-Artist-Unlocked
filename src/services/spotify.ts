let spotifyToken = '';
let tokenExpiration = 0;

export const getSpotifyToken = async (clientId: string, clientSecret: string) => {
    if (spotifyToken && Date.now() < tokenExpiration) {
        return spotifyToken;
    }

    const credentials = btoa(`${clientId}:${clientSecret}`);
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Spotify Auth Error: ${errorData.error_description || response.statusText}`);
    }

    const data = await response.json();
    spotifyToken = data.access_token;
    tokenExpiration = Date.now() + (data.expires_in * 1000) - 60000; // 1 min buffer
    return spotifyToken;
};

export interface SpotifyTrack {
    uri: string;
    name: string;
    artist: string;
    album: string;
    image?: string;
}

export const searchTracks = async (clientId: string, clientSecret: string, query: string, limit: number = 5): Promise<SpotifyTrack[]> => {
    const token = await getSpotifyToken(clientId, clientSecret);

    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.error?.message || response.statusText;
        throw new Error(`Spotify Search Error: ${msg}`);
    }

    const data = await response.json();
    if (data.tracks && data.tracks.items) {
        return data.tracks.items.map((item: { uri: string; name: string; artists: { name: string }[]; album: { name: string; images: { url: string }[] } }) => ({
            uri: item.uri,
            name: item.name,
            artist: item.artists.map((a) => a.name).join(', '),
            album: item.album.name,
            image: item.album.images?.[0]?.url
        }));
    }
    return [];
};

export const searchTrackUri = async (clientId: string, clientSecret: string, query: string): Promise<string | null> => {
    const tracks = await searchTracks(clientId, clientSecret, query, 1);
    return tracks.length > 0 ? tracks[0].uri : null;
};
