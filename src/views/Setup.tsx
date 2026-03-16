import React, { useEffect, useState } from 'react';
import { listModels } from '../services/gemini';

// Safely access electron API or provide a stub for web browser testing
const getApi = () => {
    // @ts-ignore
    if (window.electronAPI) return window.electronAPI;
    console.warn("electronAPI not found. Running in Web Browser Fallback Mode.");
    return {
        getConfig: async () => ({ geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '', fanartPersonalApiKey: '' }),
        setConfig: async () => true
    };
};

const Setup: React.FC = () => {
    const [config, setConfig] = useState({ 
        geminiKey: '', 
        geminiModel: '', 
        spotifyClientId: '', 
        spotifyClientSecret: '', 
        fanartPersonalApiKey: '',
        spotifyMobileMode: 'desktop'
    });
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);

    useEffect(() => {
        getApi().getConfig().then(async (data: any) => {
            setConfig({ ...data, spotifyMobileMode: data.spotifyMobileMode || 'desktop' });
            if (data.geminiKey) {
                fetchModels(data.geminiKey, data.geminiModel);
            }
        });
    }, []);

    const fetchModels = async (key: string, currentModel?: string) => {
        setLoadingModels(true);
        const models = await listModels(key);
        setAvailableModels(models);
        setLoadingModels(false);

        // If current model is not in available list, clear it to force a new selection
        if (currentModel && !models.includes(currentModel)) {
            setConfig(prev => ({ ...prev, geminiModel: '' }));
        }
    };

    const handleSave = async () => {
        if (!config.geminiModel && availableModels.length > 0) {
            alert('Please select a Gemini model!');
            return;
        }
        const success = await getApi().setConfig(config);
        if (success) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '600px', margin: '5vh auto', animation: 'fadeIn 0.5s' }}>
            <div className="glass-panel">
                <h1 style={{ textAlign: 'center', color: 'var(--primary)', margin: '0 0 0.5rem 0' }}>🔐 Setup Configuration</h1>
                <p style={{ textAlign: 'center', color: '#bbb', marginBottom: '2.5rem', fontSize: '0.95rem' }}>Please enter your API credentials. They are encrypted and stored locally.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--secondary)', fontSize: '0.95rem', letterSpacing: '0.5px' }}>Google Gemini API Key:</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="password"
                                value={config.geminiKey}
                                placeholder="AI..."
                                onChange={(e) => setConfig({ ...config, geminiKey: e.target.value })}
                                style={{ flex: 1 }}
                            />
                            <button className="btn-sm" onClick={() => fetchModels(config.geminiKey)}>Fetch Models</button>
                        </div>
                    </div>

                    {availableModels.length > 0 && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--secondary)', fontSize: '0.95rem', letterSpacing: '0.5px' }}>Gemini Model:</label>
                            <select 
                                value={config.geminiModel} 
                                onChange={(e) => setConfig({ ...config, geminiModel: e.target.value })}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                            >
                                <option value="" disabled>Select a model...</option>
                                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            {config.geminiModel === '' && <p style={{ color: '#ff4444', fontSize: '0.8rem', marginTop: '0.5rem' }}>⚠️ Previously selected model is no longer available. Please choose a new one.</p>}
                        </div>
                    )}

                    {loadingModels && <p style={{ textAlign: 'center', color: 'var(--primary)' }}>Fetching available models...</p>}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--secondary)', fontSize: '0.95rem', letterSpacing: '0.5px' }}>Spotify Client ID:</label>
                            <input
                                type="text"
                                value={config.spotifyClientId}
                                placeholder="ID..."
                                onChange={(e) => setConfig({ ...config, spotifyClientId: e.target.value })}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--secondary)', fontSize: '0.95rem', letterSpacing: '0.5px' }}>Spotify Client Secret:</label>
                            <input
                                type="password"
                                value={config.spotifyClientSecret}
                                placeholder="Secret..."
                                onChange={(e) => setConfig({ ...config, spotifyClientSecret: e.target.value })}
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--secondary)', fontSize: '0.95rem', letterSpacing: '0.5px' }}>Spotify Mobile Mode:</label>
                        <select 
                            value={config.spotifyMobileMode} 
                            onChange={(e) => setConfig({ ...config, spotifyMobileMode: e.target.value })}
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                        >
                            <option value="desktop">Control Desktop (Spotify App)</option>
                            <option value="mobile_app">Mobile: Open Spotify App directly</option>
                            <option value="mobile_web">Mobile: Open Web Player (Browser)</option>
                        </select>
                        <p style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.4rem' }}>Determines where music plays when you tap the Spotify button on your phone.</p>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 600, color: 'var(--secondary)', fontSize: '0.95rem', letterSpacing: '0.5px' }}>Fanart.tv Personal API Key (Optional):</label>
                        <input
                            type="password"
                            value={config.fanartPersonalApiKey || ''}
                            placeholder="Used for artist logos and backgrounds..."
                            onChange={(e) => setConfig({ ...config, fanartPersonalApiKey: e.target.value })}
                            style={{ width: '100%' }}
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={loadingModels}
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
