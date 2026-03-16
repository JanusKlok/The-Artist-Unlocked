export interface QuizArtist {
    artist: string;
    genre: string;
    visual_theme: {
        primary_color: string;
        secondary_color: string;
        animation_type: 'lightning' | 'bubbles' | 'neon_grid' | 'spotlight' | 'equalizers' | 'floating_notes' | 'grunge_static';
        font_style?: 'heavy' | 'elegant' | 'grunge' | 'retro';
        background_style?: 'dark' | 'gradient' | 'smoky' | 'grid-overlay';
    };
    unlock_song: string;
    unlock_song_uri?: string;
    unlock_song_name?: string;
    unlock_song_image?: string;
    fanart_logo?: string;
    fanart_backgrounds?: string[];
    lore_ladder: Array<{
        tier: number;
        points: number;
        target: string;
        spoken_hint: string;
        answer: string;
        audio_hint_song: string;
        audio_hint_uri?: string;
        audio_hint_name?: string;
        audio_hint_image?: string;
    }>;
}

export const listModels = async (geminiKey: string): Promise<string[]> => {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
        if (!response.ok) return [];
        const data = await response.json();
        // Filter for models that support generateContent
        return data.models
            .filter((m: any) => m.supportedGenerationMethods.includes('generateContent'))
            .map((m: any) => m.name.replace('models/', ''));
    } catch (e) {
        console.error('Failed to list models', e);
        return [];
    }
};

export const generateArtistTrivia = async (geminiKey: string, artistNames: string[], difficultyModifier: string, model: string = 'gemini-1.5-flash'): Promise<QuizArtist[]> => {
    const count = artistNames.length;
    const artistsList = artistNames.join(', ');
    const prompt = `You are an expert music historian and trivia master. Your task is to generate a trivia dataset for the following ${count} artists: ${artistsList}. 
You must return the response strictly as a valid JSON array of ${count} objects, each matching the exact structure below. Do not include markdown formatting, code blocks, or conversational text outside of the JSON array.

Difficulty Constraints:
${difficultyModifier}

The trivia must follow these rules:
1. "unlock_song" must be a well-known or appropriate track for identifying the artist.
2. "lore_ladder" must contain EXACTLY 5 items, scaling from Tier 1 (10 pts) to Tier 5 (50 pts).
3. "audio_hint_song" must be a real song by the artist related to the question.
4. "visual_theme" must fit the genre:
   - "primary_color" and "secondary_color": vivid, saturated hex colors that evoke the artist's genre and aesthetic. Avoid very dark colors (stay above #333). Each artist should feel distinctly different.
   - "animation_type": one of [lightning, bubbles, neon_grid, spotlight, equalizers, floating_notes, grunge_static]. Pick the one that best matches the genre/vibe.
   - "font_style": one of [heavy, elegant, grunge, retro]. "heavy" for metal/rock, "elegant" for jazz/soul/classical, "grunge" for punk/alternative/grunge, "retro" for synth/disco/80s.
   - "background_style": one of [dark, gradient, smoky, grid-overlay]. "dark" for metal/heavy, "gradient" for pop/soul, "smoky" for jazz/blues/psychedelic, "grid-overlay" for electronic/synth/techno.

STRICT UNIQUENESS RULE:
Every single "unlock_song" and "audio_hint_song" across all ${count} artists MUST be completely unique. You MUST NOT select the same song twice anywhere in the entire output of ${count * 6} total songs (${count} unlock songs + ${count * 5} lore ladder songs).

JSON Structure (Return an ARRAY of ${count} of these):
{
  "artist": "Artist Name",
  "genre": "Genre Name",
  "visual_theme": {
    "primary_color": "#HEXCODE",
    "secondary_color": "#HEXCODE",
    "animation_type": "allowed_type",
    "font_style": "heavy|elegant|grunge|retro",
    "background_style": "dark|gradient|smoky|grid-overlay"
  },
  "unlock_song": "Song Title",
  "lore_ladder": [
    {
      "tier": 1,
      "points": 10,
      "target": "Category",
      "spoken_hint": "The hint",
      "answer": "The answer",
      "audio_hint_song": "Song Title"
    },
    { "tier": 2, "points": 20, "target": "Category", "spoken_hint": "The hint", "answer": "The answer", "audio_hint_song": "Song Title" },
    { "tier": 3, "points": 30, "target": "Category", "spoken_hint": "The hint", "answer": "The answer", "audio_hint_song": "Song Title" },
    { "tier": 4, "points": 40, "target": "Category", "spoken_hint": "The hint", "answer": "The answer", "audio_hint_song": "Song Title" },
    { "tier": 5, "points": 50, "target": "Category", "spoken_hint": "The hint", "answer": "The answer", "audio_hint_song": "Song Title" }
  ]
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                responseMimeType: 'application/json'
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const specificError = errorData.error?.message || response.statusText;
        throw new Error(`Gemini API Error: ${specificError}`);
    }

    const data = await response.json();
    
    // Check for Gemini-specific error cases in 200 responses (e.g. safety blocks)
    if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini Safety Block: ${data.promptFeedback.blockReason}`);
    }
    
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === 'SAFETY') throw new Error('Gemini Error: Response blocked by safety filters.');
        if (finishReason === 'RECITATION') throw new Error('Gemini Error: Response blocked due to copyright/citation rules.');
        throw new Error(`Invalid response from Gemini (Finish Reason: ${finishReason || 'UNKNOWN'})`);
    }

    // Sanitize: Remove markdown code blocks if present
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    return JSON.parse(rawText) as QuizArtist[];
};
