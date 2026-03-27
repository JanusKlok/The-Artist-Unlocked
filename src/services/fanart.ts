export interface FanartAssets {
    logoUrl?: string;
    backgroundUrls: string[];
}

const FANART_PROJECT_KEY = '5abfea3e4693ea492dedae876e5bc3da';

/**
 * Looks up the MusicBrainz ID (MBID) for a given artist name.
 */
export const getArtistMbid = async (artistName: string): Promise<string | null> => {
    try {
        const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'TheArtistUnlocked/1.0 ( https://github.com/janusklok/The-Artist-Unlocked )',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('MusicBrainz API error', response.status, response.statusText);
            return null;
        }

        const data = await response.json();
        
        // Return the first exact or best match
        if (data && data.artists && data.artists.length > 0) {
            // Find an exact match if possible, otherwise just use the first one
            const exactMatch = data.artists.find((a: { name: string; id: string }) => a.name.toLowerCase() === artistName.toLowerCase());
            if (exactMatch) return exactMatch.id;
            return data.artists[0].id;
        }

        return null;
    } catch (e) {
        console.error('Failed to look up MBID', e);
        return null;
    }
};

/**
 * Fetches available image assets for an artist from Fanart.tv.
 */
export const fetchArtistFanart = async (mbid: string, personalApiKey: string): Promise<FanartAssets | null> => {
    if (!personalApiKey || !mbid) return null;

    try {
        const url = `https://webservice.fanart.tv/v3/music/${mbid}?api_key=${FANART_PROJECT_KEY}&client_key=${personalApiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.warn('Fanart API error (could be no images for artist or bad key)', response.status);
            return null;
        }

        const data = await response.json();
        
        const assets: FanartAssets = {
            backgroundUrls: []
        };

        // Get logo
        if (data.hdmusiclogo && data.hdmusiclogo.length > 0) {
            assets.logoUrl = data.hdmusiclogo[0].url;
        } else if (data.musiclogo && data.musiclogo.length > 0) {
            assets.logoUrl = data.musiclogo[0].url;
        }

        // Get backgrounds
        if (data.artistbackground && data.artistbackground.length > 0) {
            assets.backgroundUrls = data.artistbackground.slice(0, 5).map((bg: { url: string }) => bg.url);
        }

        return assets;
    } catch (e) {
        console.error('Failed to fetch Fanart images', e);
        return null;
    }
};
