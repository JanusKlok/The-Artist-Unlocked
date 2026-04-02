import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { QuizArtist } from '../services/ai';
import { calculatePoints, getNextState, getPrevState, INITIAL_GAME_STATE, type GameState, type SavedTeam, type TeamAnswer } from '../utils/gameLogic';
import type { SavedQuiz, AppConfig } from '../types/electron';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import './Dashboard.css';

const TEAMS_STORAGE_KEY = 'artist-unlocked:saved-teams';

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
        onMobileConnected: () => {},
        generatePlayerGuid: async () => '',
        getPlayerTeams: async () => [],
        generateRejoinQr: async () => ({ teamName: '', rejoinToken: '', url: '' }),
        removePlayerTeam: async () => true,
        onPlayerAnswersUpdated: () => {},
        onPlayerTeamJoined: () => {},
        onTeamLockinStatus: () => {},
    };
};

const Dashboard: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
    const [savedQuizzes, setSavedQuizzes] = useState<SavedQuiz[]>([]);
    const [answerPeeked, setAnswerPeeked] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [savedTeams, setSavedTeams] = useState<SavedTeam[]>(() => {
        try {
            const raw = localStorage.getItem(TEAMS_STORAGE_KEY);
            return raw ? (JSON.parse(raw) as SavedTeam[]) : [];
        } catch {
            return [];
        }
    });
    const [showWagerModal, setShowWagerModal] = useState(false);
    const [remoteGuid, setRemoteGuid] = useState(uuidv4());
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [mobileConnected, setMobileConnected] = useState(false);

    const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
    const [remoteIp, setRemoteIp] = useState('');
    const quizDataRef = useRef<QuizArtist[]>([]);
    const [playerGuid, setPlayerGuid] = useState('');
    const [playerAnswers, setPlayerAnswers] = useState<TeamAnswer[]>([]);
    const [showRejoinModal, setShowRejoinModal] = useState(false);
    const [rejoinQrData, setRejoinQrData] = useState<{ teamName: string; url: string; qrDataUrl: string } | null>(null);
    const [showQuizmasterQr, setShowQuizmasterQr] = useState(false);

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

        getApi().onMobileConnected?.(() => { setMobileConnected(true); setShowQuizmasterQr(false); });

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

    // Listen for player answer updates and team joins
    useEffect(() => {
        getApi().onPlayerAnswersUpdated?.((data) => {
            setPlayerAnswers(data.answers);
        });
        getApi().onPlayerTeamJoined?.(() => {
            // Team list updates come through state-updated from the server
        });
    }, []);

    // Rotate QR code GUID every 60s while QR is visible (no mobile connected yet)
    useEffect(() => {
        if (!remoteIp || mobileConnected) return;
        const interval = setInterval(() => {
            const newGuid = uuidv4();
            setRemoteGuid(newGuid);
            getApi().updateRemoteGuid(newGuid);
        }, 60000);
        return () => clearInterval(interval);
    }, [remoteIp, mobileConnected]);

    const showNewQrCode = () => {
        setMobileConnected(false);
        setShowQuizmasterQr(true);
        const newGuid = uuidv4();
        setRemoteGuid(newGuid);
        getApi().updateRemoteGuid(newGuid);
    };

    // Persist team roster to localStorage
    useEffect(() => {
        localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(savedTeams));
    }, [savedTeams]);

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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { quizData: _, ...dynamicState } = newState;
            getApi().broadcastState(dynamicState as GameState);
        }
    }, []);

    const hostQuiz = async (quizData: QuizArtist[]) => {
        const cfg = await getApi().getConfig();
        // Auto-start server if not already running
        let ip = remoteIp;
        if (!ip) {
            ip = await getApi().startRemoteServer(remoteGuid);
            setRemoteIp(ip);
        }
        const guid = await getApi().generatePlayerGuid();
        setPlayerGuid(guid);
        const playerQrUrl = `http://${ip}:3001/play?auth=${guid}`;
        broadcast({
            ...INITIAL_GAME_STATE,
            quizData,
            teams: savedTeams.filter(t => t.active).map(t => ({ name: t.name, score: 0, allInUsed: false })),
            timerDuration: gameState.timerDuration,
            timerAutoStart: gameState.timerAutoStart,
            spotifyMobileMode: (cfg?.spotifyMobileMode || 'desktop') as GameState['spotifyMobileMode'],
            lobbyMode: true,
            showPlayerQr: false,
            teamsLocked: false,
            playerQrUrl,
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
        const name = newTeamName.trim();
        if (!name) return;
        if (savedTeams.some(t => t.name.toLowerCase() === name.toLowerCase())) return;
        setSavedTeams(prev => [...prev, { name, active: true }]);
        setNewTeamName('');
    };

    const toggleTeamActive = (idx: number) => {
        setSavedTeams(prev => prev.map((t, i) => i === idx ? { ...t, active: !t.active } : t));
    };

    const deleteTeam = (idx: number) => {
        if (!window.confirm(`Delete team "${savedTeams[idx].name}"? This cannot be undone.`)) return;
        setSavedTeams(prev => prev.filter((_, i) => i !== idx));
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

    const toggleBoard = useCallback(() => broadcast({ ...gameState, showBoard: !gameState.showBoard }), [broadcast, gameState]);
    const toggleLeaderboard = useCallback(() => broadcast({ ...gameState, showLeaderboard: !gameState.showLeaderboard }), [broadcast, gameState]);

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

    const handleShowPlayerQr = async () => {
        let guid = playerGuid;
        if (!guid) {
            guid = await getApi().generatePlayerGuid();
            setPlayerGuid(guid);
        }
        const url = `http://${remoteIp}:3001/play?auth=${guid}`;
        broadcast({ ...gameState, showPlayerQr: !gameState.showPlayerQr, playerQrUrl: url });
    };

    const handleGenerateRejoinQr = async (teamName: string) => {
        const result = await getApi().generateRejoinQr(teamName);
        const qrDataUrl = await QRCode.toDataURL(result.url, { width: 400, margin: 2 });
        setRejoinQrData({ teamName: result.teamName, url: result.url, qrDataUrl });
        setShowRejoinModal(true);
    };

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

    const handleStartQuiz = useCallback(() => {
        broadcast({ ...gameState, lobbyMode: false, teamsLocked: true, showPlayerQr: false });
    }, [gameState, broadcast]);

    const handleTimerToggle = useCallback(() => {
        if (gameState.timerEndTime) {
            broadcast({ ...gameState, timerEndTime: null });
        } else {
            broadcast({ ...gameState, timerEndTime: Date.now() + gameState.timerDuration * 1000 });
        }
    }, [broadcast, gameState]);

    // Keyboard shortcuts
    useEffect(() => {
        if (!gameState.quizData.length || gameState.lobbyMode) return;

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
    }, [gameState, handleNext, handlePrev, handleReveal, handleTimerToggle, toggleBoard, toggleLeaderboard]);

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
                        {savedTeams.length > 0 && (
                            <div className="team-roster">
                                {savedTeams.map((t, i) => (
                                    <div key={i} className={`team-roster-row${t.active ? '' : ' team-roster-row--inactive'}`}>
                                        <span className="team-roster-name">{t.name}</span>
                                        <button
                                            className={`btn-sm ${t.active ? 'team-toggle--on' : 'team-toggle--off'}`}
                                            onClick={() => toggleTeamActive(i)}
                                        >
                                            {t.active ? 'Active' : 'Inactive'}
                                        </button>
                                        <button className="btn-sm team-delete-btn" onClick={() => deleteTeam(i)}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="game-grid">
                        <div>
                            <h2 className="section-title">Quizmaster Remote</h2>
                            <div className="control-panel">
                                {mobileConnected ? (
                                    <div className="remote-info">
                                        <p className="status">✅ Mobile Remote Connected!</p>
                                        <button className="btn-sm btn-nav" onClick={showNewQrCode}>Show New QR Code</button>
                                    </div>
                                ) : showQuizmasterQr && qrDataUrl ? (
                                    <div className="remote-panel">
                                        <img src={qrDataUrl} alt="QR Code" />
                                        <div className="remote-info">
                                            <p className="status">Scan QR code to connect.</p>
                                            <button className="btn-sm btn-nav" onClick={() => setShowQuizmasterQr(false)}>Hide QR Code</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button className="btn-md btn-nav" onClick={async () => {
                                        if (!remoteIp) await handleStartRemote();
                                        setShowQuizmasterQr(true);
                                    }}>Show QR Code</button>
                                )}
                            </div>

                            {remoteIp && gameState.lobbyMode && (
                                <>
                                    <h2 className="section-title">Player Join</h2>
                                    <div className="control-panel">
                                        <button
                                            className={`btn-md ${gameState.showPlayerQr ? 'btn-danger' : 'btn-success'}`}
                                            onClick={handleShowPlayerQr}
                                        >
                                            {gameState.showPlayerQr ? 'Hide Player QR on Screen' : 'Show Player QR on Screen'}
                                        </button>
                                    </div>
                                </>
                            )}

                            <h2 className="section-title">Game Flow</h2>
                            <div className="control-panel">
                                {gameState.lobbyMode ? (
                                    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                                        <p style={{ color: '#aaa', marginBottom: '1rem' }}>Teams are joining — start when ready</p>
                                        <button className="btn-lg btn-primary" onClick={handleStartQuiz} style={{ width: '100%', fontSize: '1.2rem', padding: '1rem' }}>
                                            Start Quiz
                                        </button>
                                    </div>
                                ) : (
                                    <>
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
                                    </>
                                )}
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
                                                    {remoteIp && (
                                                        <button
                                                            className="btn-sm btn-nav"
                                                            onClick={() => handleGenerateRejoinQr(t.name)}
                                                            title="Generate rejoin QR for this team"
                                                            style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', marginLeft: '0.25rem' }}
                                                        >
                                                            QR
                                                        </button>
                                                    )}
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

                            {playerAnswers.length > 0 && (
                                <>
                                    <h2 className="section-title" style={{ marginTop: '1.5rem' }}>Team Answers</h2>
                                    <div className="team-scores">
                                        {playerAnswers.map((a, i) => (
                                            <div key={i} className="team-score-row" style={{
                                                borderLeft: a.lockedIn ? '4px solid #1db954' : '4px solid #555'
                                            }}>
                                                <div className="team-info">
                                                    <span className="team-name">
                                                        {a.teamName} {a.lockedIn ? '✅' : '⏳'}
                                                    </span>
                                                    {a.changeCount > 0 && (
                                                        <span style={{ color: '#f39c12', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                                                            (edited x{a.changeCount})
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ color: '#ccc', fontSize: '1rem', marginTop: '0.25rem' }}>
                                                    {a.answer || <em style={{ opacity: 0.4 }}>No answer yet</em>}
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

                {/* Rejoin QR Modal — fully opaque to hide answers from the player scanning */}
                {showRejoinModal && rejoinQrData && (
                    <div className="modal-overlay" onClick={() => setShowRejoinModal(false)} style={{ background: '#000' }}>
                        <div className="glass-panel modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', backdropFilter: 'none' }}>
                            <h2>Rejoin QR for {rejoinQrData.teamName}</h2>
                            <p>Have the team scan this QR code. It expires after one use.</p>
                            <img src={rejoinQrData.qrDataUrl} alt="Rejoin QR"
                                 style={{ width: '300px', borderRadius: '12px', background: '#fff', padding: '1rem' }} />
                            <div className="modal-actions">
                                <button className="btn-md btn-nav" onClick={() => setShowRejoinModal(false)}>Close</button>
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
