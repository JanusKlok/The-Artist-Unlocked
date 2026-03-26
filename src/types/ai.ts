export type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'mistral';

export const AI_PROVIDERS: AiProvider[] = ['gemini', 'openai', 'anthropic', 'groq', 'mistral'];

export const PROVIDER_LABELS: Record<AiProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic Claude',
    groq: 'Groq',
    mistral: 'Mistral',
};
