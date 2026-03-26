import React, { useEffect, useState } from 'react';
import { AI_PROVIDERS, PROVIDER_LABELS, type AiProvider } from '../types/ai';

const getApi = () => {
    if (window.electronAPI) return window.electronAPI;
    console.warn("electronAPI not found. Running in Web Browser Fallback Mode.");
    return {
        getConfig: async () => ({
            geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '',
            fanartPersonalApiKey: '', spotifyMobileMode: 'desktop',
            openaiKey: '', openaiModel: '', anthropicKey: '', anthropicModel: '',
            groqKey: '', groqModel: '', mistralKey: '', mistralModel: '', defaultAiProvider: 'gemini'
        }),
        setConfig: async () => true,
        listProviderModels: async () => [],
        generateTrivia: async () => '[]',
    } as unknown as typeof window.electronAPI;
};

const EMPTY_CONFIG = {
    geminiKey: '', geminiModel: '',
    spotifyClientId: '', spotifyClientSecret: '',
    fanartPersonalApiKey: '', spotifyMobileMode: 'desktop',
    openaiKey: '', openaiModel: '',
    anthropicKey: '', anthropicModel: '',
    groqKey: '', groqModel: '',
    mistralKey: '', mistralModel: '',
    defaultAiProvider: 'gemini'
};

const inputStyle: React.CSSProperties = { flex: 1 };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--secondary)', fontSize: '0.95rem', letterSpacing: '0.5px' };
const selectStyle: React.CSSProperties = { width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' };

const Setup: React.FC = () => {
    const [config, setConfig] = useState({ ...EMPTY_CONFIG });
    const [providerModels, setProviderModels] = useState<Partial<Record<AiProvider, string[]>>>({});
    const [loadingProvider, setLoadingProvider] = useState<AiProvider | null>(null);
    const [expandedProvider, setExpandedProvider] = useState<AiProvider | null>('gemini');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        getApi().getConfig().then((data) => {
            setConfig({ ...EMPTY_CONFIG, ...data, spotifyMobileMode: data.spotifyMobileMode || 'desktop', defaultAiProvider: data.defaultAiProvider || 'gemini' });
        });
    }, []);

    const fetchProviderModels = async (provider: AiProvider, key: string) => {
        if (!key) return;
        setLoadingProvider(provider);
        const models = await getApi().listProviderModels(provider, key);
        setProviderModels(prev => ({ ...prev, [provider]: models }));
        setLoadingProvider(null);
        // If the previously saved model is no longer in the list, clear it
        const modelField = `${provider}Model` as keyof typeof config;
        if (config[modelField] && !models.includes(config[modelField] as string)) {
            setConfig(prev => ({ ...prev, [modelField]: '' }));
        }
    };

    const getKey = (provider: AiProvider): string => (config as Record<string, string>)[`${provider}Key`] || '';
    const getModel = (provider: AiProvider): string => (config as Record<string, string>)[`${provider}Model`] || '';
    const setKey = (provider: AiProvider, val: string) => setConfig(prev => ({ ...prev, [`${provider}Key`]: val }));
    const setModel = (provider: AiProvider, val: string) => setConfig(prev => ({ ...prev, [`${provider}Model`]: val }));

    const isConfigured = (provider: AiProvider) => Boolean(getKey(provider) && getModel(provider));

    const configuredProviders = AI_PROVIDERS.filter(isConfigured);

    const handleSave = async () => {
        const def = config.defaultAiProvider as AiProvider;
        if (!isConfigured(def)) {
            alert(`Please configure an API key and model for your default provider (${PROVIDER_LABELS[def]}) before saving.`);
            return;
        }
        const success = await getApi().setConfig(config);
        if (success) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    };

    const renderProviderSection = (provider: AiProvider) => {
        const key = getKey(provider);
        const model = getModel(provider);
        const models = providerModels[provider] || [];
        const isLoading = loadingProvider === provider;
        const isExpanded = expandedProvider === provider;
        const configured = isConfigured(provider);

        return (
            <div key={provider} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden' }}>
                <button
                    onClick={() => setExpandedProvider(isExpanded ? null : provider)}
                    style={{
                        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.85rem 1.25rem', background: 'rgba(255,255,255,0.04)',
                        border: 'none', boxShadow: 'none', cursor: 'pointer', textAlign: 'left'
                    }}
                >
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{PROVIDER_LABELS[provider]}</span>
                    <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {configured && <span style={{ color: '#1db954', fontSize: '0.75rem', fontWeight: 700 }}>● Configured</span>}
                        <span style={{ color: '#888', fontSize: '0.85rem' }}>{isExpanded ? '▲' : '▼'}</span>
                    </span>
                </button>

                {isExpanded && (
                    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={labelStyle}>API Key:</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="password"
                                    value={key}
                                    placeholder={`${PROVIDER_LABELS[provider]} API key...`}
                                    onChange={e => setKey(provider, e.target.value)}
                                    style={inputStyle}
                                />
                                <button
                                    className="btn-sm"
                                    onClick={() => fetchProviderModels(provider, key)}
                                    disabled={!key || isLoading}
                                >
                                    {isLoading ? 'Loading...' : 'Fetch Models'}
                                </button>
                            </div>
                        </div>

                        {(models.length > 0 || model) && (
                            <div>
                                <label style={labelStyle}>Model:</label>
                                <select
                                    value={model}
                                    onChange={e => setModel(provider, e.target.value)}
                                    style={selectStyle}
                                >
                                    <option value="" disabled>Select a model...</option>
                                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                                    {model && !models.includes(model) && (
                                        <option value={model}>{model} (saved)</option>
                                    )}
                                </select>
                                {model && models.length > 0 && !models.includes(model) && (
                                    <p style={{ color: '#ff8c00', fontSize: '0.8rem', marginTop: '0.4rem' }}>⚠️ Previously saved model not found. Please select a new one.</p>
                                )}
                            </div>
                        )}

                        {!models.length && !model && key && (
                            <p style={{ color: '#888', fontSize: '0.82rem', margin: 0 }}>Click "Fetch Models" to load available models for this key.</p>
                        )}

                        {configured && (
                            <button
                                className="btn-sm"
                                onClick={() => {
                                    if (window.confirm(`Remove ${PROVIDER_LABELS[provider]} configuration? This will clear the API key and selected model.`)) {
                                        setKey(provider, '');
                                        setModel(provider, '');
                                        setProviderModels(prev => ({ ...prev, [provider]: [] }));
                                        if (config.defaultAiProvider === provider) {
                                            const remaining = AI_PROVIDERS.filter(p => p !== provider && getKey(p) && getModel(p));
                                            setConfig(prev => ({ ...prev, defaultAiProvider: remaining[0] || 'gemini' }));
                                        }
                                    }
                                }}
                                style={{ alignSelf: 'flex-start', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff4444' }}
                            >
                                Remove Configuration
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '640px', margin: '5vh auto', animation: 'fadeIn 0.5s' }}>
            <div className="glass-panel">
                <h1 style={{ textAlign: 'center', color: 'var(--primary)', margin: '0 0 0.5rem 0' }}>🔐 Setup Configuration</h1>
                <p style={{ textAlign: 'center', color: '#bbb', marginBottom: '2.5rem', fontSize: '0.95rem' }}>Please enter your API credentials. They are encrypted and stored locally.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* AI Providers */}
                    <div>
                        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--secondary)', fontSize: '1rem' }}>🤖 AI Providers</h3>

                        {configuredProviders.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Default AI Provider:</label>
                                <select
                                    value={config.defaultAiProvider}
                                    onChange={e => setConfig(prev => ({ ...prev, defaultAiProvider: e.target.value }))}
                                    style={selectStyle}
                                >
                                    {configuredProviders.map(p => (
                                        <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {AI_PROVIDERS.map(renderProviderSection)}
                        </div>
                    </div>

                    {/* Spotify */}
                    <div>
                        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--secondary)', fontSize: '1rem' }}>🎧 Spotify</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={labelStyle}>Client ID:</label>
                                <input
                                    type="text"
                                    value={config.spotifyClientId}
                                    placeholder="ID..."
                                    onChange={e => setConfig(prev => ({ ...prev, spotifyClientId: e.target.value }))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Client Secret:</label>
                                <input
                                    type="password"
                                    value={config.spotifyClientSecret}
                                    placeholder="Secret..."
                                    onChange={e => setConfig(prev => ({ ...prev, spotifyClientSecret: e.target.value }))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Spotify Mobile Mode:</label>
                            <select
                                value={config.spotifyMobileMode}
                                onChange={e => setConfig(prev => ({ ...prev, spotifyMobileMode: e.target.value }))}
                                style={selectStyle}
                            >
                                <option value="desktop">Control Desktop (Spotify App)</option>
                                <option value="mobile_app">Mobile: Open Spotify App directly</option>
                                <option value="mobile_web">Mobile: Open Web Player (Browser)</option>
                            </select>
                            <p style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.4rem' }}>Determines where music plays when you tap the Spotify button on your phone.</p>
                        </div>
                    </div>

                    {/* Fanart */}
                    <div>
                        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--secondary)', fontSize: '1rem' }}>🖼️ Fanart.tv</h3>
                        <label style={labelStyle}>Personal API Key (Optional):</label>
                        <input
                            type="password"
                            value={config.fanartPersonalApiKey || ''}
                            placeholder="Used for artist logos and backgrounds..."
                            onChange={e => setConfig(prev => ({ ...prev, fanartPersonalApiKey: e.target.value }))}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={loadingProvider !== null}
                        style={{ padding: '1rem', marginTop: '0.5rem', fontSize: '1.1rem' }}
                    >
                        {saved ? '✅ Saved Successfully!' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Setup;
