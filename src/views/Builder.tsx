import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateArtistTrivia } from '../services/gemini';
import type { QuizArtist } from '../services/gemini';
import { searchTracks, type SpotifyTrack } from '../services/spotify';

const DIFFICULTY_MAP: Record<string, string> = {
    Casual: `Focus on mainstream, widely known facts. The "unlock_song" should be a well-known radio hit. The lore ladder should cover famous stuff. Even Tier 5 should be guessable by a general fan.`,
    Fan: `Focus on standard fan-level trivia. The "unlock_song" should be a beloved album track. The lore ladder should cover specific sessions, original names, meanings. Tier 5 should require someone to have read an article.`,
    Superfan: `Focus on extremely obscure lore. The "unlock_song" should be a B-side or demo. The lore ladder must be incredibly difficult: uncredited studio musicians, weird requests. Tier 5 must be nearly impossible.`,
};

const ANIMATION_TYPES = ['lightning', 'bubbles', 'neon_grid', 'spotlight', 'equalizers', 'floating_notes', 'grunge_static'];
const FONT_STYLES = ['heavy', 'elegant', 'grunge', 'retro'];
const BACKGROUND_STYLES = ['dark', 'gradient', 'smoky', 'grid-overlay'];

const getApi = () => window.electronAPI || {
    getConfig: async () => ({ geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '', fanartPersonalApiKey: '', spotifyMobileMode: 'desktop' }),
    saveQuiz: async () => true,
    getQuizzes: async () => [],
    deleteQuiz: async () => true,
    fetchMbid: async (_artist: string) => null,
    fetchFanart: async (_mbid: string, _key: string, _id: number) => null,
    setConfig: async () => true,
    openSpotify: async () => {},
    broadcastState: () => {},
    startRemoteServer: async () => 'localhost',
    updateRemoteGuid: async () => true,
    openPresentationWindow: async () => {},
    onStateUpdate: () => {},
} as unknown as typeof window.electronAPI;

const Builder: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const navigate = useNavigate();
    const [config, setConfig] = useState<any>(null);
    const [artists, setArtists] = useState<string[]>(['', '', '', '', '']);
    const [difficulty, setDifficulty] = useState<string>('Fan');
    const [isGenerating, setIsGenerating] = useState(false);
    const [quizData, setQuizData] = useState<QuizArtist[]>([]);
    const [quizName, setQuizName] = useState(`My Awesome Quiz - ${new Date().toLocaleDateString()}`);
    const [savedQuizzes, setSavedQuizzes] = useState<any[]>([]);
    const [editingQuizId, setEditingQuizId] = useState<number | null>(null);
    const [saveMessage, setSaveMessage] = useState('');

    // Modal state for Spotify Selection
    const [searchModal, setSearchModal] = useState<{
        isOpen: boolean;
        query: string;
        contextArtist: string;
        results: SpotifyTrack[];
        onSelect: (track: SpotifyTrack) => void;
        isSearching: boolean;
    }>({
        isOpen: false,
        query: '',
        contextArtist: '',
        results: [],
        onSelect: () => {},
        isSearching: false
    });

    // States for incremental progress
    const [_currentGeneratingIdx, setCurrentGeneratingIdx] = useState<number>(-1);
    const [statusText, setStatusText] = useState('');
    const [currentError, setCurrentError] = useState<string | null>(null);

    useEffect(() => {
        getApi().getConfig().then(setConfig);
        getApi().getQuizzes().then(setSavedQuizzes);
    }, []);

    // Reload quizzes when the tab becomes active
    useEffect(() => {
        if (isActive) {
            getApi().getQuizzes().then(setSavedQuizzes);
        }
    }, [isActive]);

    const openSearch = (initialQuery: string, artist: string, onSelect: (track: SpotifyTrack) => void) => {
        setSearchModal({
            isOpen: true,
            query: initialQuery,
            contextArtist: artist,
            results: [],
            onSelect,
            isSearching: false
        });
        if (initialQuery) handlePerformSearch(initialQuery);
    };

    const handlePerformSearch = async (query: string) => {
        if (!config?.spotifyClientId) return alert('No Spotify credentials in Setup!');
        setSearchModal(prev => ({ ...prev, query, isSearching: true }));
        try {
            const results = await searchTracks(config.spotifyClientId, config.spotifyClientSecret, query);
            setSearchModal(prev => ({ ...prev, results, isSearching: false }));
        } catch (e: any) {
            alert(e.message);
            setSearchModal(prev => ({ ...prev, isSearching: false }));
        }
    };

    const loadQuizForEditing = (quiz: any) => {
        setEditingQuizId(quiz.id);
        setQuizName(quiz.name);
        setQuizData(quiz.data);
    };

    const handleDeleteQuiz = async (e: React.MouseEvent, quizId: number, quizName: string) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete "${quizName}"?`)) {
            const success = await getApi().deleteQuiz(quizId);
            if (success) {
                setSavedQuizzes(prev => prev.filter(q => q.id !== quizId));
            } else {
                alert('Failed to delete quiz.');
            }
        }
    };

    const resetBuilder = () => {
        setQuizData([]);
        setEditingQuizId(null);
        setQuizName(`My Awesome Quiz - ${new Date().toLocaleDateString()}`);
        setArtists(['', '', '', '', '']);
        setIsGenerating(false);
        setCurrentError(null);
        setCurrentGeneratingIdx(-1);
    };

    const handleGenerate = async () => {
        if (!config?.geminiKey) return alert('Missing Gemini API Key in Setup!');
        if (!config?.geminiModel) return alert('No Gemini Model selected in Setup!');
        const validArtists = artists.filter(a => a.trim());
        if (validArtists.length === 0) return alert('Enter at least one artist!');

        setIsGenerating(true);
        setCurrentError(null);
        setQuizData([]);
        setStatusText('🤖 Generating trivia for all artists...');

        try {
            // Get fresh configuration
            const currentConfig = await getApi().getConfig();
            setConfig(currentConfig);

            const mod = DIFFICULTY_MAP[difficulty];
            const batchResults = await generateArtistTrivia(currentConfig.geminiKey, validArtists, mod, currentConfig.geminiModel);

            for (let i = 0; i < batchResults.length; i++) {
                const res = batchResults[i];
                const artist = res.artist;
                setCurrentGeneratingIdx(i);

                // Spotify Phase
                if (currentConfig.spotifyClientId) {
                    setStatusText(`🎵 Searching Spotify for ${artist}'s tracks...`);

                    const findTrack = async (song: string) => {
                        const query = `track:${song} artist:${artist}`;
                        const results = await searchTracks(currentConfig.spotifyClientId, currentConfig.spotifyClientSecret, query);

                        if (results.length === 1) return results[0];
                        if (results.length > 1) {
                            return new Promise<SpotifyTrack>((resolve) => {
                                openSearch(song + ' ' + artist, artist, (track) => {
                                    resolve(track);
                                    setSearchModal(prev => ({ ...prev, isOpen: false }));
                                });
                            });
                        }
                        return null;
                    };

                    const unlockTrack = await findTrack(res.unlock_song);
                    if (unlockTrack) {
                        res.unlock_song_uri = unlockTrack.uri;
                        res.unlock_song_name = unlockTrack.name;
                        res.unlock_song_image = unlockTrack.image;
                    }

                    for (let j = 0; j < res.lore_ladder.length; j++) {
                        const item = res.lore_ladder[j];
                        if (item.audio_hint_song) {
                            setStatusText(`🎵 Finding audio hint ${j + 1}/5 for ${artist}...`);
                            const hintTrack = await findTrack(item.audio_hint_song);
                            if (hintTrack) {
                                item.audio_hint_uri = hintTrack.uri;
                                item.audio_hint_name = hintTrack.name;
                                item.audio_hint_image = hintTrack.image;
                            }
                        }
                    }
                }

                // Fanart Phase
                if (currentConfig.fanartPersonalApiKey) {
                    setStatusText(`🖼️ Fetching Fanart for ${artist}...`);
                    const mbid = await getApi().fetchMbid(artist);
                    if (mbid) {
                        const quizId = editingQuizId || Date.now();
                        const fanart = await getApi().fetchFanart(mbid, currentConfig.fanartPersonalApiKey, quizId);
                        if (fanart) {
                            res.fanart_logo = fanart.logoUrl;
                            res.fanart_backgrounds = fanart.backgroundUrls;
                        }
                    }
                }

                setQuizData(prev => [...prev, res]);
            }
        } catch (e: any) {
            console.error(e);
            setCurrentError(`Generation failed: ${e.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRetry = () => {
        handleGenerate();
    };

    const updateQuestion = (aIdx: number, tIdx: number, field: string, value: unknown) => {
        const newData = [...quizData];
        (newData[aIdx].lore_ladder[tIdx] as Record<string, unknown>)[field] = value;
        setQuizData(newData);
    };

    const updateArtist = (aIdx: number, field: string, value: unknown) => {
        const newData = [...quizData];
        const artist = newData[aIdx] as unknown as Record<string, unknown>;
        if (field.includes('.')) {
            const [parent, child] = field.split('.');
            (artist[parent] as Record<string, unknown>)[child] = value;
        } else {
            artist[field] = value;
        }
        setQuizData(newData);
    };

    const handleFileUpload = (aIdx: number, field: string, file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                if (field === 'fanart_backgrounds') {
                    const currentBgs = quizData[aIdx].fanart_backgrounds || [];
                    if (currentBgs.length < 5) {
                        updateArtist(aIdx, 'fanart_backgrounds', [...currentBgs, e.target.result as string]);
                    } else {
                        alert("Maximum 5 backgrounds allowed.");
                    }
                } else {
                    updateArtist(aIdx, field, e.target.result as string);
                }
            }
        };
        reader.readAsDataURL(file);
    };

    const removeBackground = (aIdx: number, bgIdx: number) => {
        const currentBgs = quizData[aIdx].fanart_backgrounds || [];
        updateArtist(aIdx, 'fanart_backgrounds', currentBgs.filter((_, i) => i !== bgIdx));
    };

    const saveQuiz = async (goToDashboard = false) => {
        const quizId = editingQuizId || Date.now();
        const payload = { id: quizId, name: quizName, data: quizData };
        await getApi().saveQuiz(payload);
        setEditingQuizId(quizId);
        getApi().getQuizzes().then(setSavedQuizzes);
        if (goToDashboard) {
            // Since we are in tabs, we just reset the builder view to 'main'
            // and maybe the user can manually switch to Dashboard tab.
            // Or we could have a prop callback to switch tabs, but for now 
            // staying consistent with 'Back' means returning to selection.
            resetBuilder();
        } else {
            setSaveMessage('✅ Saved!');
            setTimeout(() => setSaveMessage(''), 2000);
        }
    };

    const isGenerationComplete = quizData.length === artists.filter(a => a.trim()).length;

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '2rem auto', animation: 'fadeIn 0.5s' }}>
            <div className="glass-panel">
                <h1 style={{ textAlign: 'center', color: 'var(--primary)', marginBottom: '2rem' }}>🎨 Quiz Builder</h1>

                {quizData.length === 0 && !isGenerating && !currentError ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Load Saved Quiz Section */}
                        {savedQuizzes.length > 0 && (
                            <>
                                <h3 style={{ margin: 0, color: 'var(--secondary)' }}>📂 Edit a Saved Quiz</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem' }}>
                                    {savedQuizzes.map((q, idx) => (
                                        <div key={idx} style={{ position: 'relative' }}>
                                            <button
                                                onClick={() => loadQuizForEditing(q)}
                                                style={{
                                                    background: 'rgba(255,255,255,0.05)',
                                                    border: '1px solid rgba(255,255,255,0.15)',
                                                    boxShadow: 'none',
                                                    textAlign: 'left',
                                                    padding: '1rem 1.25rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.25rem',
                                                    transition: 'all 0.2s',
                                                    width: '100%'
                                                }}
                                            >
                                                <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>{q.name}</span>
                                                <span style={{ fontSize: '0.8rem', color: '#aaa', textTransform: 'none', letterSpacing: 0 }}>{q.data.length} artists</span>
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteQuiz(e, q.id, q.name)}
                                                style={{
                                                    position: 'absolute',
                                                    top: '0.5rem',
                                                    right: '0.5rem',
                                                    background: 'rgba(255, 68, 68, 0.1)',
                                                    border: '1px solid rgba(255, 68, 68, 0.3)',
                                                    color: '#ff4444',
                                                    padding: '0.2rem 0.5rem',
                                                    fontSize: '0.7rem',
                                                    borderRadius: '4px',
                                                    boxShadow: 'none'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <hr style={{ margin: '0.5rem 0', borderColor: 'rgba(255,255,255,0.08)' }} />
                            </>
                        )}

                        <h3 style={{ margin: 0, color: 'var(--secondary)' }}>✨ Create a New Quiz</h3>
                        <h4 style={{ margin: 0, color: '#aaa', fontWeight: 400, fontSize: '0.95rem' }}>1. Choose Your Artists</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                            {artists.map((a, i) => (
                                <input
                                    key={i}
                                    placeholder={`Artist ${i + 1} (e.g. The Beatles)`}
                                    value={a}
                                    onChange={e => {
                                        const nw = [...artists]; nw[i] = e.target.value; setArtists(nw);
                                    }}
                                />
                            ))}
                        </div>

                        <label>
                            <h4 style={{ margin: '0.5rem 0 0.5rem 0', color: '#aaa', fontWeight: 400, fontSize: '0.95rem' }}>2. Select Difficulty</h4>
                            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                                <option value="Casual">Casual Listener (Easy - Mainstream Hits)</option>
                                <option value="Fan">Dedicated Fan (Medium - Album Tracks)</option>
                                <option value="Superfan">Superfan (Hard - B-sides & Deep Lore)</option>
                            </select>
                        </label>

                        <button onClick={handleGenerate} style={{ marginTop: '1rem', padding: '1.2rem', fontSize: '1.2rem' }}>
                            ✨ Generate Magic Lore Quiz ✨
                        </button>
                        <button onClick={() => navigate('/')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', boxShadow: 'none' }}>
                            Back to Home
                        </button>
                    </div>
                ) : (
                    <div>
                        <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--secondary)' }}>
                                    {editingQuizId ? '✏️ Editing Quiz' : '💾 Save Your Masterpiece'}
                                </h3>
                                {saveMessage && <span style={{ color: '#1db954', fontWeight: 'bold', fontSize: '1.1rem' }}>{saveMessage}</span>}
                            </div>
                            <input
                                value={quizName}
                                onChange={e => setQuizName(e.target.value)}
                                placeholder="Give this quiz a memorable name..."
                                style={{ fontSize: '1.5rem', fontWeight: 'bold', border: `2px solid ${editingQuizId ? 'var(--secondary)' : 'var(--primary)'}` }}
                            />
                        </div>

                        <h3 style={{ borderBottom: '2px solid var(--secondary)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>Review & Edit Content</h3>
                        
                        {quizData.map((data, aIdx) => (
                            <div key={aIdx} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem', border: `1px solid ${data.visual_theme.primary_color}44`, animation: 'slideIn 0.4s ease-out' }}>
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>Artist Name</label>
                                        <input value={data.artist} onChange={e => updateArtist(aIdx, 'artist', e.target.value)} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>Genre</label>
                                        <input value={data.genre} onChange={e => updateArtist(aIdx, 'genre', e.target.value)} />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>Primary Color</label>
                                        <input type="color" value={data.visual_theme.primary_color} onChange={e => updateArtist(aIdx, 'visual_theme.primary_color', e.target.value)} style={{ height: '40px', padding: '2px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>Secondary Color</label>
                                        <input type="color" value={data.visual_theme.secondary_color} onChange={e => updateArtist(aIdx, 'visual_theme.secondary_color', e.target.value)} style={{ height: '40px', padding: '2px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>Animation</label>
                                        <select value={data.visual_theme.animation_type} onChange={e => updateArtist(aIdx, 'visual_theme.animation_type', e.target.value)}>
                                            {ANIMATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>Font Style</label>
                                        <select value={data.visual_theme.font_style || 'heavy'} onChange={e => updateArtist(aIdx, 'visual_theme.font_style', e.target.value)}>
                                            {FONT_STYLES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: '#ccc' }}>Background</label>
                                        <select value={data.visual_theme.background_style || 'dark'} onChange={e => updateArtist(aIdx, 'visual_theme.background_style', e.target.value)}>
                                            {BACKGROUND_STYLES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div style={{ 
                                    background: data.unlock_song_uri ? 'rgba(29, 185, 84, 0.1)' : 'rgba(255, 68, 68, 0.1)', 
                                    padding: '1.25rem', 
                                    borderRadius: '12px', 
                                    marginBottom: '1.5rem', 
                                    border: data.unlock_song_uri ? '1px solid #1db95444' : '2px solid #ff4444' 
                                }}>
                                    <strong style={{ color: data.unlock_song_uri ? '#1db954' : '#ff4444', display: 'block', marginBottom: '0.75rem' }}>
                                        🔓 Phase 1: The Unlock {!data.unlock_song_uri && '⚠️ (MISSING TRACK)'}
                                    </strong>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        {data.unlock_song_image && <img src={data.unlock_song_image} style={{ width: '60px', height: '60px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} alt="Album Art" />}
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.8rem', color: '#ccc', display: 'block', marginBottom: '0.3rem' }}>Selected Spotify Track</label>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <input 
                                                    value={data.unlock_song_name || 'No track selected...'} 
                                                    readOnly 
                                                    style={{ 
                                                        background: 'rgba(0,0,0,0.2)', 
                                                        color: data.unlock_song_name ? '#fff' : '#ff4444',
                                                        border: data.unlock_song_uri ? '' : '1px solid #ff4444'
                                                    }} 
                                                />
                                                <button className="btn-sm" onClick={() => openSearch(data.unlock_song + ' ' + data.artist, data.artist, (track) => {
                                                    updateArtist(aIdx, 'unlock_song_uri', track.uri);
                                                    updateArtist(aIdx, 'unlock_song_name', track.name);
                                                    updateArtist(aIdx, 'unlock_song_image', track.image);
                                                })}>🔍 Search</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Artist Assets / Fanart Section */}
                                <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <strong style={{ display: 'block', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>🖼️ Artist Assets</strong>
                                    
                                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                                        {/* Logo Column */}
                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                            <label style={{ fontSize: '0.85rem', color: '#ccc', display: 'block', marginBottom: '0.5rem' }}>Artist Logo</label>
                                            {data.fanart_logo ? (
                                                <div style={{ position: 'relative', display: 'inline-block', background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px' }}>
                                                    <img src={data.fanart_logo} alt="Artist Logo" style={{ maxHeight: '60px', objectFit: 'contain' }} />
                                                    <button 
                                                        onClick={() => updateArtist(aIdx, 'fanart_logo', '')}
                                                        style={{ position: 'absolute', top: -10, right: -10, background: '#ff4444', borderRadius: '50%', width: '24px', height: '24px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}
                                                    >✕</button>
                                                </div>
                                            ) : (
                                                <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.2)', textAlign: 'center' }}>
                                                    <p style={{ opacity: 0.5, fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>No logo.</p>
                                                    <label className="btn-sm btn-ghost" style={{ cursor: 'pointer', display: 'inline-block' }}>
                                                        Upload Logo
                                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { 
                                                            if (e.target.files && e.target.files[0]) handleFileUpload(aIdx, 'fanart_logo', e.target.files[0]);
                                                        }} />
                                                    </label>
                                                </div>
                                            )}
                                        </div>

                                        {/* Backgrounds Column */}
                                        <div style={{ flex: 2, minWidth: '300px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <label style={{ fontSize: '0.85rem', color: '#ccc' }}>Backgrounds ({(data.fanart_backgrounds || []).length}/5)</label>
                                                {(data.fanart_backgrounds || []).length < 5 && (
                                                    <label className="btn-sm btn-ghost" style={{ cursor: 'pointer', padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}>
                                                        + Add
                                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                                                            if (e.target.files && e.target.files[0]) handleFileUpload(aIdx, 'fanart_backgrounds', e.target.files[0]);
                                                        }} />
                                                    </label>
                                                )}
                                            </div>
                                            
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {(data.fanart_backgrounds || []).map((bg, bgIdx) => (
                                                    <div key={bgIdx} style={{ position: 'relative', width: '80px', height: '45px', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                                                        <img src={bg} alt={`Background ${bgIdx+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        <button 
                                                            onClick={() => removeBackground(aIdx, bgIdx)}
                                                            style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(255,68,68,0.8)', borderRadius: '50%', width: '16px', height: '16px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}
                                                        >✕</button>
                                                    </div>
                                                ))}
                                                {(data.fanart_backgrounds || []).length === 0 && (
                                                    <p style={{ opacity: 0.5, fontSize: '0.8rem', margin: 0 }}>No custom backgrounds.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {data.lore_ladder.map((q, tIdx) => (
                                        <div key={q.tier} style={{ 
                                            background: 'rgba(0,0,0,0.4)', 
                                            padding: '1rem', 
                                            borderRadius: '8px', 
                                            borderLeft: `4px solid ${data.visual_theme.primary_color}`,
                                            borderRight: q.audio_hint_uri ? '' : '2px solid #ff4444'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <strong style={{ color: 'var(--secondary)' }}>Tier {q.tier} - {q.target} {!q.audio_hint_uri && '⚠️'}</strong>
                                                <span>
                                                    Points: <input type="number" value={q.points} style={{ width: '80px', padding: '0.2rem' }} onChange={e => updateQuestion(aIdx, tIdx, 'points', parseInt(e.target.value) || 0)} />
                                                </span>
                                            </div>
                                            <textarea
                                                value={q.spoken_hint}
                                                onChange={e => updateQuestion(aIdx, tIdx, 'spoken_hint', e.target.value)}
                                                style={{ minHeight: '60px', marginBottom: '0.75rem' }}
                                                placeholder="Spoken Hint..."
                                            />
                                            <div style={{ 
                                                background: q.audio_hint_uri ? 'rgba(255,255,255,0.03)' : 'rgba(255, 68, 68, 0.1)', 
                                                padding: '0.75rem', 
                                                borderRadius: '8px', 
                                                display: 'flex', 
                                                gap: '1rem', 
                                                alignItems: 'center',
                                                border: q.audio_hint_uri ? 'none' : '1px solid #ff4444'
                                            }}>
                                                {q.audio_hint_image && <img src={q.audio_hint_image} style={{ width: '45px', height: '45px', borderRadius: '4px' }} alt="Art" />}
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <input
                                                            value={q.audio_hint_name || 'No track selected...'}
                                                            readOnly
                                                            style={{ 
                                                                background: 'rgba(0,0,0,0.2)', 
                                                                color: q.audio_hint_name ? '#fff' : '#ff4444', 
                                                                flex: 1 
                                                            }}
                                                        />
                                                        <button className="btn-sm" onClick={() => openSearch(q.audio_hint_song + ' ' + data.artist, data.artist, (track) => {
                                                            updateQuestion(aIdx, tIdx, 'audio_hint_uri', track.uri);
                                                            updateQuestion(aIdx, tIdx, 'audio_hint_name', track.name);
                                                            updateQuestion(aIdx, tIdx, 'audio_hint_image', track.image);
                                                        })}>🔍 Find Track</button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <label style={{ fontSize: '0.7rem', color: '#888' }}>Expected Answer:</label>
                                                <input
                                                    value={q.answer}
                                                    onChange={e => updateQuestion(aIdx, tIdx, 'answer', e.target.value)}
                                                    placeholder="Answer..."
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {!isGenerationComplete && (isGenerating || currentError) && (
                            <div style={{ background: 'rgba(0,0,0,0.4)', border: '2px dashed rgba(255,255,255,0.2)', borderRadius: '12px', padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
                                {currentError ? (
                                    <div style={{ animation: 'shake 0.5s' }}>
                                        <h3 style={{ color: '#ff4444', marginBottom: '1rem' }}>⚠️ Generation Halted</h3>
                                        <p style={{ marginBottom: '1.5rem', opacity: 0.8, wordBreak: 'break-word' }}>{currentError}</p>
                                        <button onClick={handleRetry} style={{ background: '#ff4444' }}>Retry Step</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="loader" style={{ margin: '0 auto 1.5rem' }}></div>
                                        <h3 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>{statusText}</h3>
                                        <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Artist {quizData.length + 1} of {artists.filter(a => a.trim()).length}</p>
                                    </>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                            <button onClick={resetBuilder} style={{ flex: 1, background: '#555', boxShadow: 'none' }}>
                                Discard & Restart
                            </button>
                            <button onClick={() => saveQuiz(false)} disabled={!isGenerationComplete && !editingQuizId} style={{ flex: 1, padding: '1.2rem', fontSize: '1.1rem', background: '#1db954' }}>
                                💾 Save
                            </button>
                            <button onClick={() => saveQuiz(true)} disabled={!isGenerationComplete && !editingQuizId} style={{ flex: 1, padding: '1.2rem', fontSize: '1.1rem' }}>
                                💾 Save & Dashboard
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Spotify Selection Modal */}
            {searchModal.isOpen && (
                <div className="modal-overlay">
                    <div className="glass-panel modal-content" style={{ maxWidth: '600px', width: '90%' }}>
                        <h2 style={{ color: 'var(--primary)' }}>🎵 Select Track for {searchModal.contextArtist}</h2>
                        <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
                            <input 
                                value={searchModal.query} 
                                onChange={e => setSearchModal(prev => ({ ...prev, query: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handlePerformSearch(searchModal.query)}
                                placeholder="Search tracks..."
                                style={{ flex: 1 }}
                            />
                            <button className="btn-md btn-primary" onClick={() => handlePerformSearch(searchModal.query)}>Search</button>
                        </div>

                        <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {searchModal.isSearching ? (
                                <p style={{ textAlign: 'center', padding: '2rem' }}>Searching Spotify...</p>
                            ) : searchModal.results.length === 0 ? (
                                <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No tracks found. Try a different search term.</p>
                            ) : (
                                searchModal.results.map((t, i) => (
                                    <div key={i} className="track-result-card" onClick={() => { searchModal.onSelect(t); setSearchModal(prev => ({ ...prev, isOpen: false })); }}>
                                        {t.image && <img src={t.image} alt={t.album} style={{ width: '50px', height: '50px', borderRadius: '4px' }} />}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 'bold' }}>{t.name}</div>
                                            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>{t.artist} • {t.album}</div>
                                        </div>
                                        <button className="btn-sm btn-accent">Select</button>
                                    </div>
                                ))
                            )}
                        </div>
                        <button className="btn-md btn-ghost" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setSearchModal(prev => ({ ...prev, isOpen: false }))}>Cancel</button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-10px); }
                    75% { transform: translateX(10px); }
                }
                .loader {
                    width: 40px; height: 40px;
                    border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: var(--primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.8); z-index: 1000;
                    display: flex; align-items: center; justify-content: center;
                    backdrop-filter: blur(5px);
                }
                .track-result-card {
                    display: flex; align-items: center; gap: 1rem;
                    padding: 0.75rem; background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
                    cursor: pointer; transition: all 0.2s;
                }
                .track-result-card:hover { background: rgba(255,255,255,0.1); border-color: var(--primary); }
            `}</style>
        </div>
    );
};

export default Builder;
