import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { QuizArtist } from '../services/gemini';
import { calculatePoints, getNextState, getPrevState, INITIAL_GAME_STATE, type GameState } from '../utils/gameLogic';
import type { SavedQuiz, AppConfig } from '../types/electron';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import './Dashboard.css';

const getApi = () => {
    if (window.electronAPI) return window.electronAPI;
    return {
        broadcastState: () => { },
        startRemoteServer: async () => 'localhost',
        updateRemoteGuid: async () => true,
        openSpotify: () => alert('Spotify Desktop trigger mocked for Web Layer'),
        openPresentationWindow: () => window.open('/#/presentation', '_blank', 'width=1280,height=720'),
        getQuizzes: async () => [] as SavedQuiz[],
        deleteQuiz: async () => true,
        getConfig: async () => ({ geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '', fanartPersonalApiKey: '', spotifyMobileMode: 'desktop' }) as AppConfig,
        setConfig: async () => true,
        saveQuiz: async () => true,
        fetchMbid: async () => null,
        fetchFanart: async () => null,
        onStateUpdate: () => {},
    };
};

const Dashboard: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [savedQuizzes, setSavedQuizzes] = useState<SavedQuiz[]>([]);
    const [answerPeeked, setAnswerPeeked] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [showWagerModal, setShowWagerModal] = useState(false);
    const [remoteGuid, setRemoteGuid] = useState(uuidv4());
    const [qrDataUrl, setQrDataUrl] = useState('');

    const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
    const [remoteIp, setRemoteIp] = useState('');
    const quizDataRef = useRef<QuizArtist[]>([]);

    useEffect(() => {
        getApi().getQuizzes().then(setSavedQuizzes);
        getApi().getConfig().then((cfg: AppConfig) => {
            if (cfg?.spotifyMobileMode) {
                setGameState(prev => {
                    const newState = { ...prev, spotifyMobileMode: cfg.spotifyMobileMode as GameState['spotifyMobileMode'] };
                    if (newState.quizData.length > 0) {
                        getApi().broadcastState(newState);
                    }
                    return newState;
                });
            }
        });

        getApi().onStateUpdate?.((newState: GameState) => {
            if (newState.quizData && newState.quizData.length > 0) {
                quizDataRef.current = newState.quizData;
            }
            setGameState({
                ...newState,
                quizData: (newState.quizData && newState.quizData.length > 0) ? newState.quizData : quizDataRef.current,
            });
            setAnswerPeeked(false);
        });
    }, []);

    // Generate QR code locally whenever remoteIp or remoteGuid changes
    useEffect(() => {
        if (!remoteIp) return;
        const url = `http://${remoteIp}:3001?auth=${remoteGuid}`;
        QRCode.toDataURL(url, { width: 150, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
            .then(setQrDataUrl)
            .catch(console.error);
    }, [remoteIp, remoteGuid]);

    // GUID Rotation logic
    useEffect(() => {
        if (!remoteIp) return;
        const interval = setInterval(() => {
            const newGuid = uuidv4();
            setRemoteGuid(newGuid);
            getApi().updateRemoteGuid(newGuid);
            if (gameState.quizData.length > 0) {
                getApi().broadcastState(gameState);
            }
        }, 60000);
        return () => clearInterval(interval);
    }, [remoteIp, gameState]);

    // Reload quizzes and config when the tab becomes active
    useEffect(() => {
        if (isActive) {
            getApi().getQuizzes().then(setSavedQuizzes);
            getApi().getConfig().then((cfg: AppConfig) => {
                if (cfg?.spotifyMobileMode) {
                    setGameState(prev => {
                        const newState = { ...prev, spotifyMobileMode: cfg.spotifyMobileMode as GameState['spotifyMobileMode'] };
                        if (newState.quizData.length > 0) {
                            getApi().broadcastState(newState);
                        }
                        return newState;
                    });
                }
            });
        }
    }, [isActive]);

    const broadcast = useCallback((newState: GameState) => {
        setGameState(newState);
        // Only include quizData in broadcast when it actually changed
        if (newState.quizData !== quizDataRef.current) {
            quizDataRef.current = newState.quizData;
            getApi().broadcastState(newState);
        } else {
            const { quizData: _qd, ...dynamicState } = newState;
            getApi().broadcastState(dynamicState as GameState);
        }
    }, []);

    const hostQuiz = async (quizData: QuizArtist[]) => {
        const cfg = await getApi().getConfig();
        broadcast({
            ...INITIAL_GAME_STATE,
            quizData,
            teams: gameState.teams,
            timerDuration: gameState.timerDuration,
            timerAutoStart: gameState.timerAutoStart,
            spotifyMobileMode: (cfg?.spotifyMobileMode || 'desktop') as GameState['spotifyMobileMode'],
        });
    };

    const handleStartRemote = async () => {
        const ip = await getApi().startRemoteServer(remoteGuid);
        setRemoteIp(ip);
        if (gameState.quizData.length > 0) {
            getApi().broadcastState(gameState);
        }
    };

    const addTeam = () => {
        if (!newTeamName.trim()) return;
        broadcast({ ...gameState, teams: [...gameState.teams, { name: newTeamName.trim(), score: 0, allInUsed: false }] });
        setNewTeamName('');
    };

    const addPointsToTeam = (idx: number, pts: number, isWager = false) => {
        const teams = [...gameState.teams];
        const added = calculatePoints(isWager ? false : gameState.allInActive, pts);
        teams[idx] = { ...teams[idx], score: teams[idx].score + added };
        broadcast({ ...gameState, teams });
    };

    const toggleTeamAllIn = (idx: number) => {
        const teams = [...gameState.teams];
        if (teams[idx].allInUsed && !gameState.allInActive) return;

        if (!gameState.allInActive) {
            teams[idx] = { ...teams[idx], allInUsed: true };
            broadcast({ ...gameState, teams, allInActive: true });
        } else {
            broadcast({ ...gameState, allInActive: false });
        }
    };

    const toggleBoard = () => broadcast({ ...gameState, showBoard: !gameState.showBoard });
    const toggleLeaderboard = () => broadcast({ ...gameState, showLeaderboard: !gameState.showLeaderboard });

    const handleNext = useCallback(() => {
        setAnswerPeeked(false);
        broadcast(getNextState(gameState));
    }, [gameState, broadcast]);

    const handlePrev = useCallback(() => {
        setAnswerPeeked(false);
        if (gameState.winnerMode) {
            broadcast({ ...gameState, winnerMode: false });
            return;
        }
        broadcast(getPrevState(gameState));
    }, [gameState, broadcast]);

    const handleReveal = useCallback(() => {
        broadcast({ ...gameState, showAnswer: true });
    }, [gameState, broadcast]);

    const handleStopHosting = () => {
        if (window.confirm('Are you sure you want to stop hosting? Current progress will be lost.')) {
            broadcast({ ...gameState, quizData: [] });
        }
    };

    const handleDeleteQuiz = async (quizId: number) => {
        if (!window.confirm('Are you sure you want to delete this quiz? This cannot be undone.')) return;
        if (await getApi().deleteQuiz(quizId)) {
            setSavedQuizzes(prev => prev.filter(sq => sq.id !== quizId));
        }
    };

    const handleTimerToggle = () => {
        if (gameState.timerEndTime) {
            broadcast({ ...gameState, timerEndTime: null });
        } else {
            broadcast({ ...gameState, timerEndTime: Date.now() + gameState.timerDuration * 1000 });
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        if (!gameState.quizData.length) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            switch (e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    handleNext();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    handlePrev();
                    break;
                case ' ':
                    e.preventDefault();
                    if (!gameState.showAnswer) handleReveal();
                    break;
                case 'b':
                case 'B':
                    e.preventDefault();
                    toggleBoard();
                    break;
                case 'l':
                case 'L':
                    e.preventDefault();
                    toggleLeaderboard();
                    break;
                case 't':
                case 'T':
                    e.preventDefault();
                    handleTimerToggle();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState, handleNext, handlePrev, handleReveal]);

    const currentPoints = gameState.activeTier === 0 ? 10 : (gameState.quizData[gameState.activeArtistIndex]?.lore_ladder?.[gameState.activeTier - 1]?.points || 10);
    const isFinalQuestion = gameState.activeArtistIndex === gameState.quizData.length - 1 && gameState.activeTier === 5;
    const isLastStepBeforeFinish = isFinalQuestion && gameState.showAnswer;

    return (
        <div className="dashboard-root">
            <div className="glass-panel">
                <div className="dashboard-header">
                    <h1>🎮 Quizmaster Dashboard</h1>
                    <div className="dashboard-header-actions">
                        {gameState.quizData.length > 0 && <button className="btn-md btn-danger btn-danger-hosting" onClick={handleStopHosting}>Stop Hosting</button>}
                        <button className="btn-md btn-accent" onClick={() => getApi().openPresentationWindow()}>Open Presentation Screen</button>
                    </div>
                </div>

                <hr className="dashboard-divider" />

                {!gameState.quizData.length ? (
                    <div>
                        <h2 className="section-title">Select a Quiz to Host</h2>
                        {savedQuizzes.length === 0 ? (
                            <div className="no-quizzes">
                                <p>No quizzes found! Use the <strong>Quiz Builder</strong> tab to create one.</p>
                            </div>
                        ) : (
                            <div className="quiz-grid">
                                {savedQuizzes.map((q, idx) => (
                                    <div key={idx} className="quiz-card">
                                        <h3>{q.name}</h3>
                                        <p className="quiz-meta">{q.data.length} Artists included.</p>
                                        <button className="btn-lg btn-primary" onClick={() => hostQuiz(q.data)}>Host This Quiz 🚀</button>
                                        <button className="btn-danger btn-danger-delete" onClick={() => handleDeleteQuiz(q.id)}>Delete</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <hr className="dashboard-divider" />
                        <h2 className="section-title">Team Setup</h2>
                        <div className="team-setup-row">
                            <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="Enter team name..." onKeyDown={e => e.key === 'Enter' && addTeam()} />
                            <button className="btn-md btn-primary" onClick={addTeam}>+ Add Team</button>
                        </div>
                        {gameState.teams.length > 0 && (
                            <div className="team-chips">
                                {gameState.teams.map((t, i) => (
                                    <div key={i} className="team-chip">
                                        <strong>{t.name}</strong>
                                        <button className="remove-btn" onClick={() => { const teams = gameState.teams.filter((_, idx) => idx !== i); broadcast({ ...gameState, teams }); }}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="game-grid">
                        <div>
                            <h2 className="section-title">Remote Control</h2>
                            <div className="control-panel">
                                {remoteIp ? (
                                    <div className="remote-panel">
                                        {qrDataUrl && <img src={qrDataUrl} alt="QR Code" />}
                                        <div className="remote-info">
                                            <p className="status">✅ Remote Server Running!</p>
                                            <p className="url">Key refreshes every minute for security.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <button className="btn-lg btn-success" onClick={handleStartRemote}>Start Mobile Remote</button>
                                )}
                            </div>

                            <h2 className="section-title">Game Flow</h2>
                            <div className="control-panel">
                                <div className="flow-buttons">
                                    <button className="btn-md btn-nav" onClick={handlePrev} disabled={gameState.activeArtistIndex === 0 && gameState.activeTier === 0}>⬅ Previous</button>
                                    <button className={`btn-md btn-primary ${isLastStepBeforeFinish ? 'btn-finish' : ''}`} onClick={handleNext}>
                                        {isLastStepBeforeFinish ? '🏁 Finish Quiz' : 'Next ➡'}
                                    </button>
                                </div>

                                <div className="action-buttons">
                                    <div className="action-row">
                                        <button
                                            className="btn-md btn-reveal"
                                            onClick={handleReveal}
                                            disabled={gameState.showAnswer}
                                        >
                                            👁 Reveal Answer
                                        </button>
                                        <button className="btn-md btn-board" onClick={toggleBoard}>
                                            {gameState.showBoard ? '❌ Hide Board' : '📋 Show Board'}
                                        </button>
                                    </div>
                                    {isFinalQuestion && (
                                        <button className="btn-md btn-wager" onClick={() => setShowWagerModal(true)}>
                                            💰 Manage Final Wagers
                                        </button>
                                    )}
                                </div>

                                {/* Timer Controls */}
                                <div className="timer-controls">
                                    <div className="timer-row">
                                        <label className="timer-label">Timer</label>
                                        <input
                                            type="number"
                                            className="timer-input"
                                            value={gameState.timerDuration}
                                            min={5}
                                            max={120}
                                            onChange={e => setGameState(prev => ({ ...prev, timerDuration: parseInt(e.target.value) || 30 }))}
                                        />
                                        <span className="timer-unit">sec</span>
                                        <label className="timer-auto-label">
                                            <input
                                                type="checkbox"
                                                checked={gameState.timerAutoStart}
                                                onChange={e => broadcast({ ...gameState, timerAutoStart: e.target.checked })}
                                            />
                                            Auto
                                        </label>
                                        <button className={`btn-sm ${gameState.timerEndTime ? 'btn-timer-stop' : 'btn-timer-start'}`} onClick={handleTimerToggle}>
                                            {gameState.timerEndTime ? '⏹ Stop' : '⏱ Start'}
                                        </button>
                                    </div>
                                </div>

                                <div className="keyboard-hints">
                                    <span>Shortcuts:</span>
                                    <kbd>Space</kbd> Reveal
                                    <kbd>←</kbd><kbd>→</kbd> Nav
                                    <kbd>B</kbd> Board
                                    <kbd>L</kbd> Scores
                                    <kbd>T</kbd> Timer
                                </div>
                            </div>

                            {/* Team Scoreboard */}
                            {gameState.teams.length > 0 && (
                                <>
                                    <div className="scoreboard-heading">
                                        <h2>Scoreboard & Points</h2>
                                        <button className={`btn-sm ${gameState.showLeaderboard ? 'btn-leaderboard-hide' : 'btn-leaderboard-show'}`} onClick={toggleLeaderboard}>
                                            {gameState.showLeaderboard ? '🙈 Hide Screen Leaderboard' : '👁 Show Screen Leaderboard'}
                                        </button>
                                    </div>
                                    <div className="team-scores">
                                        {gameState.teams.map((t, i) => (
                                            <div key={i} className={`team-score-row ${gameState.allInActive && t.allInUsed ? 'all-in-active' : ''}`}>
                                                <div className="team-info">
                                                    <span className="team-name">{t.name}</span>
                                                    <span className="team-pts">{t.score} pts</span>
                                                    {isFinalQuestion && t.wager !== undefined && <span className="wager-label">(Wagered: {t.wager})</span>}
                                                </div>
                                                <div className="point-buttons">
                                                    <button className="btn-sm btn-pts-neg" onClick={() => addPointsToTeam(i, -currentPoints)}>-{currentPoints}</button>
                                                    <button className="btn-sm btn-pts-neg-sm" onClick={() => addPointsToTeam(i, -5)}>-5</button>
                                                    <button className="btn-sm btn-pts-pos-sm" onClick={() => addPointsToTeam(i, 5)}>+5</button>
                                                    <button className="btn-sm btn-pts-pos" onClick={() => addPointsToTeam(i, currentPoints)}>+{currentPoints}</button>
                                                    {isFinalQuestion && t.wager !== undefined && (
                                                        <>
                                                            <button className="btn-sm btn-pts-pos" onClick={() => addPointsToTeam(i, t.wager || 0, true)}>+Wager</button>
                                                            <button className="btn-sm btn-pts-neg" onClick={() => addPointsToTeam(i, -(t.wager || 0), true)}>-Wager</button>
                                                        </>
                                                    )}
                                                    <button
                                                        className={`btn-sm ${t.allInUsed ? (gameState.allInActive ? 'btn-allin-active' : 'btn-allin-used') : (isFinalQuestion ? 'btn-allin-used' : 'btn-allin')}`}
                                                        onClick={() => toggleTeamAllIn(i)}
                                                        disabled={(t.allInUsed && !gameState.allInActive) || isFinalQuestion}
                                                    >
                                                        {gameState.allInActive && t.allInUsed ? 'Deactivate' : (t.allInUsed ? '🔒 Used' : '🔥 All-In')}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <div>
                            <h2 className="section-title">Quizmaster Prompts</h2>
                            <div className="prompts-panel">
                                <div className="prompts-header">
                                    <h3>Artist {gameState.activeArtistIndex + 1} of {gameState.quizData.length}</h3>
                                    <span className="phase-badge">
                                        {gameState.activeTier === 0 ? '🔓 UNLOCK PHASE' : `Tier ${gameState.activeTier}`}
                                    </span>
                                </div>
                                <h4 className="artist-label">{gameState.quizData[gameState.activeArtistIndex]?.artist}</h4>

                                {gameState.winnerMode ? (
                                    <div className="prompt-card winner">
                                        <h2 className="winner-prompt-title">🏆 QUIZ COMPLETE!</h2>
                                        <p className="winner-prompt-text">Final scores are shown on the presentation screen.</p>
                                        <button className="btn-lg" onClick={() => broadcast({ ...gameState, quizData: [] })}>Exit to Menu</button>
                                    </div>
                                ) : (() => {
                                    const artist = gameState.quizData[gameState.activeArtistIndex];
                                    if (!artist) return null;

                                    if (gameState.activeTier === 0) {
                                        return (
                                            <>
                                                <div className="prompt-card identification">
                                                    <p className="prompt-label">Phase 1: Identification</p>
                                                    <p className="prompt-text">Play the song and have teams identify the Artist + Song.</p>
                                                </div>

                                                <div className="prompt-card answer" onClick={() => setAnswerPeeked(!answerPeeked)}>
                                                    <p className="prompt-label">{answerPeeked ? 'Identity:' : '🔒 Click to peek'}</p>
                                                    {answerPeeked && (
                                                        <p className="prompt-text answer-text">
                                                            {artist.artist} - {artist.unlock_song}
                                                        </p>
                                                    )}
                                                </div>

                                                <button
                                                    className={`btn-lg btn-success ${!artist.unlock_song_uri ? 'btn-spotify-disabled' : ''}`}
                                                    onClick={() => getApi().openSpotify(artist.unlock_song_uri || '')}
                                                    disabled={!artist.unlock_song_uri}
                                                >
                                                    {artist.unlock_song_uri ? '🎵 Play Unlock Song (Spotify)' : '❌ No Spotify Link Found'}
                                                </button>
                                            </>
                                        );
                                    }

                                    const currentQ = artist.lore_ladder[gameState.activeTier - 1];
                                    return (
                                        <>
                                            <div className="prompt-card question">
                                                <p className="prompt-label prompt-label-upper">Read Aloud ({currentQ.target}):</p>
                                                <p className="prompt-text prompt-text-light">{currentQ.spoken_hint}</p>
                                            </div>

                                            <div className="prompt-card answer" onClick={() => setAnswerPeeked(!answerPeeked)}>
                                                <p className="prompt-label">{answerPeeked ? 'Exact Answer:' : '🔒 Click to peek'}</p>
                                                {answerPeeked && <p className="prompt-text answer-text">{currentQ.answer}</p>}
                                                <p className="prompt-meta">Base Value: {currentQ.points} pts</p>
                                            </div>

                                            <button
                                                className={`btn-lg btn-success ${!currentQ.audio_hint_uri ? 'btn-spotify-disabled' : ''}`}
                                                onClick={() => getApi().openSpotify(currentQ.audio_hint_uri || '')}
                                                disabled={!currentQ.audio_hint_uri}
                                            >
                                                {currentQ.audio_hint_uri ? '🎵 Play Audio Hint (Spotify)' : '❌ No Spotify Link Found'}
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* Final Wager Modal */}
                {showWagerModal && (
                    <div className="modal-overlay">
                        <div className="glass-panel modal-content">
                            <h2>Final Wager Entry</h2>
                            <p className="wager-description">Teams can wager up to their current total score.</p>
                            {gameState.teams.map((t, i) => (
                                <div key={i} className="wager-entry">
                                    <label className="wager-label">{t.name} (Max: {t.score})</label>
                                    <input
                                        type="number"
                                        value={t.wager || 0}
                                        onChange={e => {
                                            const teams = [...gameState.teams];
                                            const val = Math.min(t.score, Math.max(0, parseInt(e.target.value) || 0));
                                            teams[i] = { ...teams[i], wager: val };
                                            broadcast({ ...gameState, teams });
                                        }}
                                    />
                                </div>
                            ))}
                            <div className="modal-actions">
                                <button className="btn-md btn-success" onClick={() => { broadcast({ ...gameState, wagersLocked: true }); setShowWagerModal(false); }}>🔒 Lock Wagers & Notify Screen</button>
                                <button className="btn-md btn-nav" onClick={() => setShowWagerModal(false)}>Close</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
