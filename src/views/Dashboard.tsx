import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QuizArtist } from '../services/gemini';
import { calculatePoints, getNextState, getPrevState, type GameState } from '../utils/gameLogic';
import './Dashboard.css';

const getApi = () => {
    // @ts-ignore
    if (window.electronAPI) return window.electronAPI;
    return {
        broadcastState: () => { },
        startRemoteServer: async () => 'localhost',
        openSpotify: () => alert('Spotify Desktop trigger mocked for Web Layer'),
        openPresentationWindow: () => window.open('/#/presentation', '_blank', 'width=1280,height=720'),
        getQuizzes: async () => [],
        deleteQuiz: async () => true
    };
};

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const [savedQuizzes, setSavedQuizzes] = useState<any[]>([]);
    const [answerPeeked, setAnswerPeeked] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [showWagerModal, setShowWagerModal] = useState(false);

    const [gameState, setGameState] = useState<GameState>({
        activeArtistIndex: 0,
        activeTier: 0,
        showAnswer: false,
        showBoard: false,
        showLeaderboard: true,
        quizData: [],
        allInActive: false,
        winnerMode: false,
        teams: [],
        wagersLocked: false
    });
    const [remoteIp, setRemoteIp] = useState('');

    useEffect(() => {
        getApi().getQuizzes().then(setSavedQuizzes);

        // Listen for external state updates (from mobile remote or other sources)
        getApi().onStateUpdate?.((newState: any) => {
            setGameState(newState);
            setAnswerPeeked(false);
        });
    }, []);

    const broadcast = (newState: GameState) => {
        setGameState(newState);
        getApi().broadcastState(newState);
    };

    const hostQuiz = (quizData: QuizArtist[]) => {
        broadcast({ ...gameState, quizData, activeArtistIndex: 0, activeTier: 0, showAnswer: false, showBoard: false, showLeaderboard: true, allInActive: false, winnerMode: false, wagersLocked: false });
    };

    const handleStartRemote = async () => {
        const ip = await getApi().startRemoteServer();
        setRemoteIp(ip);
    };

    const addTeam = () => {
        if (!newTeamName.trim()) return;
        broadcast({ ...gameState, teams: [...gameState.teams, { name: newTeamName.trim(), score: 0, allInUsed: false }] });
        setNewTeamName('');
    };

    const addPointsToTeam = (idx: number, pts: number, isWager = false) => {
        const teams = [...gameState.teams];
        // If it's a wager, ignore All-In status (pass false)
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

    const toggleBoard = () => {
        broadcast({ ...gameState, showBoard: !gameState.showBoard });
    };

    const toggleLeaderboard = () => {
        broadcast({ ...gameState, showLeaderboard: !gameState.showLeaderboard });
    };

    const handleNext = () => {
        setAnswerPeeked(false);
        broadcast(getNextState(gameState));
    };

    const handlePrev = () => {
        setAnswerPeeked(false);
        broadcast(getPrevState(gameState));
    };

    const currentPoints = gameState.activeTier === 0 ? 10 : (gameState.quizData[gameState.activeArtistIndex]?.lore_ladder?.[gameState.activeTier - 1]?.points || 10);
    const isFinalQuestion = gameState.activeArtistIndex === gameState.quizData.length - 1 && gameState.activeTier === 5;

    return (
        <div className="dashboard-root">
            <div className="glass-panel">
                <div className="dashboard-header">
                    <h1>🎮 Quizmaster Dashboard</h1>
                    <div className="dashboard-header-actions">
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
                                        <button className="btn-danger" style={{ width: '100%', marginTop: '0.75rem' }} onClick={async () => {
                                            if (await getApi().deleteQuiz(q.id)) {
                                                setSavedQuizzes(savedQuizzes.filter(sq => sq.id !== q.id));
                                            }
                                        }}>Delete</button>
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
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=http://${remoteIp}:3001`} alt="QR Code" />
                                        <div className="remote-info">
                                            <p className="status">✅ Remote Server Running!</p>
                                            <p className="url">Scan the QR code with your phone:<br /><strong style={{ color: '#fff', fontSize: '1.2rem' }}>http://{remoteIp}:3001</strong></p>
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
                                    <button className="btn-md btn-primary" onClick={handleNext} disabled={gameState.winnerMode}>Next ➡</button>
                                </div>

                                <div className="action-buttons">
                                    <div className="action-row">
                                        <button className="btn-md btn-reveal" onClick={() => broadcast({ ...gameState, showAnswer: true })}>
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
                            </div>

                            {/* Team Scoreboard */}
                            {gameState.teams.length > 0 && (
                                <>
                                    <div className="scoreboard-heading">
                                        <h2>Scoreboard & Points</h2>
                                        <button className="btn-sm" style={{ background: gameState.showLeaderboard ? '#dc3545' : '#1db954' }} onClick={toggleLeaderboard}>
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
                                                    <button className="btn-sm" style={{ background: '#28a745' }} onClick={() => addPointsToTeam(i, 5)}>+5</button>
                                                    <button className="btn-sm" style={{ background: '#17a2b8' }} onClick={() => addPointsToTeam(i, currentPoints)}>+{currentPoints}</button>
                                                    {isFinalQuestion && t.wager !== undefined && (
                                                        <>
                                                            <button className="btn-sm" style={{ background: '#1db954' }} onClick={() => addPointsToTeam(i, t.wager || 0, true)}>+Wager</button>
                                                            <button className="btn-sm" style={{ background: '#dc3545' }} onClick={() => addPointsToTeam(i, -(t.wager || 0), true)}>-Wager</button>
                                                        </>
                                                    )}
                                                    <button className="btn-sm" onClick={() => toggleTeamAllIn(i)} disabled={(t.allInUsed && !gameState.allInActive) || isFinalQuestion} style={{ background: t.allInUsed ? (gameState.allInActive ? '#ff4444' : '#555') : (isFinalQuestion ? '#555' : '#ffc107'), color: t.allInUsed && gameState.allInActive ? '#fff' : '#000' }}>
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
                                <h4 className="artist-label">{gameState.quizData[gameState.activeArtistIndex].artist}</h4>

                                {(() => {
                                    const artist = gameState.quizData[gameState.activeArtistIndex];
                                    if (gameState.activeTier === 0) {
                                        return (
                                            <>
                                                <div className="prompt-card identification">
                                                    <p className="prompt-label">Phase 1: Identification</p>
                                                    <p className="prompt-text">Play the song and have teams identify the Artist + Song.</p>
                                                    <p style={{ marginTop: '1rem' }}><strong>Artist:</strong> {artist.artist}</p>
                                                    <p><strong>Unlock Song:</strong> {artist.unlock_song}</p>
                                                </div>
                                                <button className="btn-lg btn-success" onClick={() => getApi().openSpotify(artist.unlock_song_uri || '')}>
                                                    🎵 Play Unlock Song (Spotify)
                                                </button>
                                            </>
                                        );
                                    }

                                    const currentQ = artist.lore_ladder[gameState.activeTier - 1];
                                    return (
                                        <>
                                            <div className="prompt-card question">
                                                <p className="prompt-label" style={{ textTransform: 'uppercase' }}>Read Aloud ({currentQ.target}):</p>
                                                <p className="prompt-text" style={{ fontWeight: 400 }}>{currentQ.spoken_hint}</p>
                                            </div>

                                            <div className="prompt-card answer" onClick={() => setAnswerPeeked(!answerPeeked)}>
                                                <p className="prompt-label">{answerPeeked ? 'Exact Answer:' : '🔒 Click to peek'}</p>
                                                {answerPeeked && <p className="prompt-text answer-text">{currentQ.answer}</p>}
                                                <p className="prompt-meta">Base Value: {currentQ.points} pts</p>
                                            </div>

                                            <button className="btn-lg btn-success" onClick={() => getApi().openSpotify(currentQ.audio_hint_uri || '')}>
                                                🎵 Play Audio Hint (Spotify)
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
                            <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>Teams can wager up to their current total score.</p>
                            {gameState.teams.map((t, i) => (
                                <div key={i} style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.3rem' }}>{t.name} (Max: {t.score})</label>
                                    <input 
                                        type="number" 
                                        value={t.wager || 0} 
                                        onChange={e => {
                                            const teams = [...gameState.teams];
                                            const val = Math.min(t.score, Math.max(0, parseInt(e.target.value) || 0));
                                            teams[i].wager = val;
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
