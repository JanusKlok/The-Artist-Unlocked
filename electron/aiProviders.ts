type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'mistral';

const SYSTEM_PROMPT = 'You are an expert music historian and trivia master. Always respond with valid JSON only.';

/**
 * Lists available models for a given AI provider.
 * Returns an empty array on any error so the UI degrades gracefully.
 */
export async function listProviderModels(provider: AiProvider, apiKey: string): Promise<string[]> {
    try {
        switch (provider) {
            case 'gemini': {
                const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
                    headers: { 'x-goog-api-key': apiKey }
                });
                if (!res.ok) return [];
                const data = await res.json();
                if (!Array.isArray(data.models)) return [];
                return (data.models as Record<string, unknown>[])
                    .filter(m => Array.isArray(m.supportedGenerationMethods) && (m.supportedGenerationMethods as string[]).includes('generateContent'))
                    .map(m => (m.name as string).replace('models/', ''));
            }
            case 'openai': {
                const res = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (!res.ok) return [];
                const data = await res.json();
                return (data.data as { id: string }[])
                    .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
                    .map(m => m.id)
                    .sort()
                    .reverse();
            }
            case 'anthropic': {
                const res = await fetch('https://api.anthropic.com/v1/models', {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    }
                });
                if (!res.ok) return [];
                const data = await res.json();
                return (data.data as { id: string }[]).map(m => m.id);
            }
            case 'groq': {
                const res = await fetch('https://api.groq.com/openai/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (!res.ok) return [];
                const data = await res.json();
                const chatKeywords = ['llama', 'mixtral', 'gemma', 'qwen', 'deepseek'];
                return (data.data as { id: string }[])
                    .filter(m => chatKeywords.some(kw => m.id.toLowerCase().includes(kw)))
                    .map(m => m.id);
            }
            case 'mistral': {
                const res = await fetch('https://api.mistral.ai/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (!res.ok) return [];
                const data = await res.json();
                return (data.data as { id: string; capabilities?: { completion_chat?: boolean } }[])
                    .filter(m => m.capabilities?.completion_chat === true)
                    .map(m => m.id);
            }
            default:
                return [];
        }
    } catch (e) {
        console.error(`Failed to list models for ${provider}`, e);
        return [];
    }
}

/**
 * Sends the trivia generation prompt to the specified provider and returns the raw JSON string.
 * The caller is responsible for parsing and validating the response.
 */
export async function fetchTriviaCompletion(
    provider: AiProvider,
    apiKey: string,
    model: string,
    prompt: string
): Promise<string> {
    switch (provider) {
        case 'gemini': {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
                    })
                }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({})) as Record<string, Record<string, string>>;
                throw new Error(`gemini API Error (${res.status}): ${err.error?.message || res.statusText}`);
            }
            const data = await res.json();
            if (data.promptFeedback?.blockReason) {
                throw new Error(`Gemini Safety Block: ${data.promptFeedback.blockReason}`);
            }
            const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                const reason = data.candidates?.[0]?.finishReason;
                if (reason === 'SAFETY') throw new Error('Gemini Error: Response blocked by safety filters.');
                if (reason === 'RECITATION') throw new Error('Gemini Error: Response blocked due to copyright rules.');
                throw new Error(`Invalid response from Gemini (Finish Reason: ${reason || 'UNKNOWN'})`);
            }
            return text.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        case 'openai':
        case 'groq':
        case 'mistral': {
            const endpoints: Record<string, string> = {
                openai: 'https://api.openai.com/v1/chat/completions',
                groq: 'https://api.groq.com/openai/v1/chat/completions',
                mistral: 'https://api.mistral.ai/v1/chat/completions',
            };
            const res = await fetch(endpoints[provider], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    response_format: { type: 'json_object' }
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
                throw new Error(`${provider} API Error (${res.status}): ${err.error?.message || res.statusText}`);
            }
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content as string | undefined;
            if (!text) throw new Error(`Invalid response from ${provider}`);
            return text.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        case 'anthropic': {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 8192,
                    system: SYSTEM_PROMPT,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 1 // Anthropic only allows temperature=1 with extended thinking off
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
                throw new Error(`anthropic API Error (${res.status}): ${err.error?.message || res.statusText}`);
            }
            const data = await res.json();
            const text = (data.content as { type: string; text: string }[])?.[0]?.text;
            if (!text) throw new Error('Invalid response from Anthropic');
            return text.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        default:
            throw new Error(`Unknown AI provider: ${provider}`);
    }
}
