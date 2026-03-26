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

const VALID_ANIMATION_TYPES = ['lightning', 'bubbles', 'neon_grid', 'spotlight', 'equalizers', 'floating_notes', 'grunge_static'];
const VALID_FONT_STYLES = ['heavy', 'elegant', 'grunge', 'retro'];
const VALID_BACKGROUND_STYLES = ['dark', 'gradient', 'smoky', 'grid-overlay'];

function validateQuizData(data: unknown): QuizArtist[] {
    if (!Array.isArray(data)) {
        throw new Error('Gemini returned invalid data: expected a JSON array.');
    }

    return data.map((item: Record<string, unknown>, i: number) => {
        const label = `Artist ${i + 1}`;

        if (!item.artist || typeof item.artist !== 'string') {
            throw new Error(`${label}: missing or invalid "artist" name.`);
        }
        if (!item.genre || typeof item.genre !== 'string') {
            throw new Error(`${label} (${item.artist}): missing "genre".`);
        }

        // Validate visual_theme
        const theme = item.visual_theme as Record<string, unknown> | undefined;
        if (!theme || typeof theme !== 'object') {
            throw new Error(`${label} (${item.artist}): missing "visual_theme".`);
        }
        if (!theme.primary_color || typeof theme.primary_color !== 'string') {
            throw new Error(`${label} (${item.artist}): missing "visual_theme.primary_color".`);
        }
        if (!theme.secondary_color || typeof theme.secondary_color !== 'string') {
            throw new Error(`${label} (${item.artist}): missing "visual_theme.secondary_color".`);
        }
        if (!VALID_ANIMATION_TYPES.includes(theme.animation_type as string)) {
            throw new Error(`${label} (${item.artist}): invalid animation_type "${theme.animation_type}". Must be one of: ${VALID_ANIMATION_TYPES.join(', ')}`);
        }
        if (theme.font_style && !VALID_FONT_STYLES.includes(theme.font_style as string)) {
            throw new Error(`${label} (${item.artist}): invalid font_style "${theme.font_style}".`);
        }
        if (theme.background_style && !VALID_BACKGROUND_STYLES.includes(theme.background_style as string)) {
            throw new Error(`${label} (${item.artist}): invalid background_style "${theme.background_style}".`);
        }

        // Validate unlock_song
        if (!item.unlock_song || typeof item.unlock_song !== 'string') {
            throw new Error(`${label} (${item.artist}): missing "unlock_song".`);
        }

        // Validate lore_ladder
        const ladder = item.lore_ladder;
        if (!Array.isArray(ladder) || ladder.length !== 5) {
            throw new Error(`${label} (${item.artist}): "lore_ladder" must have exactly 5 tiers, got ${Array.isArray(ladder) ? ladder.length : 'non-array'}.`);
        }

        const expectedPoints = [10, 20, 30, 40, 50];
        ladder.forEach((tier: Record<string, unknown>, t: number) => {
            const tierLabel = `${label} (${item.artist}), Tier ${t + 1}`;
            if (!tier.spoken_hint || typeof tier.spoken_hint !== 'string') {
                throw new Error(`${tierLabel}: missing "spoken_hint".`);
            }
            if (!tier.answer || typeof tier.answer !== 'string') {
                throw new Error(`${tierLabel}: missing "answer".`);
            }
            if (!tier.audio_hint_song || typeof tier.audio_hint_song !== 'string') {
                throw new Error(`${tierLabel}: missing "audio_hint_song".`);
            }
            // Fix tier number and points if incorrect
            tier.tier = t + 1;
            tier.points = expectedPoints[t];
        });

        return item as unknown as QuizArtist;
    });
}

export const listModels = async (geminiKey: string): Promise<string[]> => {
    try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            headers: { 'x-goog-api-key': geminiKey }
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.models
            .filter((m: Record<string, unknown>) => (m.supportedGenerationMethods as string[]).includes('generateContent'))
            .map((m: Record<string, string>) => m.name.replace('models/', ''));
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

CRITICAL VISUAL DISTINCTION RULES:
Each of the ${count} artists MUST have a completely distinct visual identity. Follow these constraints:
- NO two artists may share the same "animation_type". Pick ${count} different types from the allowed list.
- NO two artists may share the same "font_style". Pick ${count} different styles (if ${count} <= 4).
- NO two artists may share the same "background_style". Pick ${count} different styles (if ${count} <= 4).
- Color palettes must contrast strongly: if one artist uses warm tones (reds/oranges/yellows), the next should use cool tones (blues/greens/purples). Avoid similar hues across artists. Think about the color wheel and maximize distance between each artist's palette.
- The overall visual feel of each artist should be immediately recognizable and distinct from all others.

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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey
        },
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
        const specificError = (errorData as Record<string, Record<string, string>>).error?.message || response.statusText;
        throw new Error(`Gemini API Error: ${specificError}`);
    }

    const data = await response.json();

    // Check for Gemini-specific error cases in 200 responses (e.g. safety blocks)
    if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini Safety Block: ${data.promptFeedback.blockReason}`);
    }

    let rawText: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
        const finishReason = data.candidates?.[0]?.finishReason;
        if (finishReason === 'SAFETY') throw new Error('Gemini Error: Response blocked by safety filters.');
        if (finishReason === 'RECITATION') throw new Error('Gemini Error: Response blocked due to copyright/citation rules.');
        throw new Error(`Invalid response from Gemini (Finish Reason: ${finishReason || 'UNKNOWN'})`);
    }

    // Sanitize: Remove markdown code blocks if present
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed: unknown = JSON.parse(rawText);
    return validateQuizData(parsed);
};
