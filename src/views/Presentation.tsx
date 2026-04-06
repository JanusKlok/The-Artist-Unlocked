import React, { useEffect, useState, useMemo, useRef } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadFull } from 'tsparticles';
import type { GameState } from '../utils/gameLogic';
import type { QuizArtist } from '../services/ai';
import { sounds } from '../utils/sounds';
import QRCode from 'qrcode';

// Font style mapping
const FONT_MAP: Record<string, string> = {
    heavy: "'Bebas Neue', sans-serif",
    elegant: "'Playfair Display', serif",
    grunge: "'Rock Salt', cursive",
    retro: "'Press Start 2P', monospace",
    'hip-hop': "'Anton', sans-serif",
    handwritten: "'Permanent Marker', cursive",
    vaporwave: "'Monoton', cursive",
    industrial: "'Black Ops One', cursive",
    lounge: "'Satisfy', cursive",
    pop: "'Poppins', sans-serif",
    country: "'Rye', serif",
    funk: "'Righteous', cursive",
    techno: "'Orbitron', sans-serif",
    latin: "'Fredoka One', cursive",
    reggae: "'Lobster', cursive",
    blues: "'Abril Fatface', serif",
    classical: "'Cinzel', serif",
    folk: "'Amatic SC', cursive",
    emo: "'Kalam', cursive",
    glam: "'Audiowide', sans-serif",
    gospel: "'Alfa Slab One', serif",
    psychedelic: "'Boogaloo', cursive",
    'country-pop': "'Pacifico', cursive",
    'jazz-modern': "'Oswald', sans-serif",
    shoegaze: "'Josefin Sans', sans-serif",
    trap: "'Exo 2', sans-serif",
    'metal-death': "'UnifrakturMaguntia', cursive",
    'new-wave': "'Special Elite', cursive",
    opera: "'Cormorant SC', serif",
    'indie-pop': "'Comfortaa', cursive",
};

const FONT_IMPORTS = [
    'Syncopate:wght@400;700',
    'Outfit:wght@300;400;700;900',
    'Bebas+Neue',
    'Playfair+Display:wght@400;700;900',
    'Rock+Salt',
    'Press+Start+2P',
    'Anton',
    'Permanent+Marker',
    'Monoton',
    'Black+Ops+One',
    'Satisfy',
    'Poppins:wght@400;700;900',
    'Rye',
    'Righteous',
    'Orbitron:wght@400;700;900',
    'Fredoka+One',
    'Lobster',
    'Abril+Fatface',
    'Cinzel:wght@400;700;900',
    'Amatic+SC:wght@400;700',
    'Kalam:wght@300;400;700',
    'Audiowide',
    'Alfa+Slab+One',
    'Boogaloo',
    'Pacifico',
    'Oswald:wght@400;600;700',
    'Josefin+Sans:wght@300;400;700',
    'Exo+2:wght@400;700;900',
    'UnifrakturMaguntia',
    'Special+Elite',
    'Cormorant+SC:wght@400;600;700',
    'Comfortaa:wght@400;700',
].join('&family=');

const AnimatedScore: React.FC<{ target: number }> = ({ target }) => {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        const start = performance.now();
        const duration = 2000;
        const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setDisplay(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [target]);
    return <>{display}</>;
};

const Presentation: React.FC = () => {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [init, setInit] = useState(false);
    const [flash, setFlash] = useState(false);
    const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
    const [timerExpired, setTimerExpired] = useState(false);
    const [transitionKey, setTransitionKey] = useState(0);
    const [playerQrDataUrl, setPlayerQrDataUrl] = useState('');
    const [lobbyTeams, setLobbyTeams] = useState<string[]>([]);
    const [newTeamFlash, setNewTeamFlash] = useState<string | null>(null);
    const [teamLockins, setTeamLockins] = useState<Record<string, boolean>>({});
    const answerRef = useRef<HTMLDivElement>(null);
    const isMountedRef = useRef(true);
    const quizDataCacheRef = useRef<QuizArtist[]>([]);

    // Refs for tracking previous values (sound effects)
    const prevShowAnswerRef = useRef(false);
    const prevAllInActiveRef = useRef(false);
    const prevWinnerModeRef = useRef(false);
    const prevArtistIndexRef = useRef(0);
    const prevTierRef = useRef(0);
    const lastUrgentTickRef = useRef(0);
    const buzzerPlayedRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        initParticlesEngine(async (engine) => {
            await loadFull(engine);
        }).then(() => {
            if (isMountedRef.current) setInit(true);
        });

        if (window.electronAPI) {
            window.electronAPI.onStateUpdate((newState: GameState) => {
                if (!isMountedRef.current) return;

                // Handle partial state updates: merge cached quizData if missing
                if (!newState.quizData || newState.quizData.length === 0) {
                    newState = { ...newState, quizData: quizDataCacheRef.current };
                } else {
                    quizDataCacheRef.current = newState.quizData;
                }

                setGameState(newState);
            });
        }

        return () => { isMountedRef.current = false; };
    }, []);

    // Generate player QR code when showPlayerQr and playerQrUrl are set
    useEffect(() => {
        if (!gameState?.showPlayerQr || !gameState?.playerQrUrl) {
            setPlayerQrDataUrl('');
            return;
        }
        QRCode.toDataURL(gameState.playerQrUrl, {
            width: 300, margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        })
            .then(setPlayerQrDataUrl)
            .catch(console.error);
    }, [gameState?.showPlayerQr, gameState?.playerQrUrl]);

    // Listen for team joins and lock-in status
    useEffect(() => {
        if (window.electronAPI?.onPlayerTeamJoined) {
            window.electronAPI.onPlayerTeamJoined((data) => {
                setLobbyTeams(prev => [...prev, data.teamName]);
                setNewTeamFlash(data.teamName);
                setTimeout(() => setNewTeamFlash(null), 2000);
            });
        }
        if (window.electronAPI?.onTeamLockinStatus) {
            window.electronAPI.onTeamLockinStatus(setTeamLockins);
        }
    }, []);

    // Populate lobbyTeams from gameState.teams during lobby
    useEffect(() => {
        if (gameState?.lobbyMode && gameState.teams) {
            setLobbyTeams(gameState.teams.map(t => t.name));
        }
    }, [gameState?.lobbyMode, gameState?.teams]);

    // Scroll to top on step change
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [gameState?.activeArtistIndex, gameState?.activeTier]);

    // Scroll to answer when revealed
    useEffect(() => {
        if (gameState?.showAnswer && answerRef.current) {
            setTimeout(() => {
                answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [gameState?.showAnswer]);

    // Effect for random lightning flashes
    useEffect(() => {
        if (!gameState || !gameState.quizData.length) return;
        const currentArtist = gameState.quizData[gameState.activeArtistIndex];
        if (currentArtist?.visual_theme?.animation_type !== 'lightning') return;

        let localMounted = true;
        let timer: ReturnType<typeof setTimeout>;

        const triggerFlash = () => {
            if (!localMounted) return;
            setFlash(true);
            setTimeout(() => { if (localMounted) setFlash(false); }, 100 + Math.random() * 200);

            // Randomly trigger a double flash
            if (Math.random() > 0.7) {
                setTimeout(() => {
                    if (!localMounted) return;
                    setFlash(true);
                    setTimeout(() => { if (localMounted) setFlash(false); }, 50 + Math.random() * 100);
                }, 300);
            }

            scheduleNext();
        };

        const scheduleNext = () => {
            if (!localMounted) return;
            const delay = 3000 + Math.random() * 8000;
            timer = setTimeout(triggerFlash, delay);
        };

        scheduleNext();
        return () => {
            localMounted = false;
            clearTimeout(timer);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState?.activeArtistIndex, gameState?.quizData?.[gameState?.activeArtistIndex ?? 0]?.visual_theme?.animation_type]); // intentional: only restart on artist/animation change, not every state update

    const artist = useMemo(() => {
        if (!gameState?.quizData?.length) return null;
        return gameState.quizData[gameState.activeArtistIndex];
    }, [gameState?.activeArtistIndex, gameState?.quizData]);

    // Memoize sorted teams
    const sortedTeams = useMemo(() => {
        if (!gameState?.teams) return [];
        return [...gameState.teams].sort((a, b) => b.score - a.score);
    }, [gameState?.teams]);

    // Sound effect: play reveal sound when answer is shown
    useEffect(() => {
        if (gameState?.showAnswer && !prevShowAnswerRef.current) {
            sounds.playReveal();
        }
        prevShowAnswerRef.current = gameState?.showAnswer ?? false;
    }, [gameState?.showAnswer]);

    // Sound effect: play all-in sound
    useEffect(() => {
        if (gameState?.allInActive && !prevAllInActiveRef.current) {
            sounds.playAllIn();
        }
        prevAllInActiveRef.current = gameState?.allInActive ?? false;
    }, [gameState?.allInActive]);

    // Sound effect: play winner sound
    useEffect(() => {
        if (gameState?.winnerMode && !prevWinnerModeRef.current) {
            sounds.playWinner();
        }
        prevWinnerModeRef.current = gameState?.winnerMode ?? false;
    }, [gameState?.winnerMode]);

    // Visual transition on question change — increment key to force remount + animation
    useEffect(() => {
        const idx = gameState?.activeArtistIndex;
        const tier = gameState?.activeTier;
        if (idx === undefined || tier === undefined) return;
        const changed = idx !== prevArtistIndexRef.current || tier !== prevTierRef.current;
        if (changed) setTransitionKey(k => k + 1);
        prevArtistIndexRef.current = idx;
        prevTierRef.current = tier;
    }, [gameState?.activeArtistIndex, gameState?.activeTier]);

    // Timer display effect
    useEffect(() => {
        if (!gameState?.timerEndTime) {
            setTimerRemaining(null);
            setTimerExpired(false);
            buzzerPlayedRef.current = false;
            lastUrgentTickRef.current = -1;
            return;
        }

        const interval = setInterval(() => {
            const remainingMs = Math.max(0, gameState.timerEndTime! - Date.now());
            setTimerRemaining(remainingMs);

            // Play a tick each time the displayed whole-second number changes (≤10s)
            const currentSecond = Math.ceil(remainingMs / 1000);
            if (remainingMs > 0 && currentSecond <= 10 && currentSecond !== lastUrgentTickRef.current) {
                lastUrgentTickRef.current = currentSecond;
                sounds.playUrgentTick();
            }

            // Buzzer at 0
            if (remainingMs === 0 && !buzzerPlayedRef.current) {
                buzzerPlayedRef.current = true;
                lastUrgentTickRef.current = -1;
                sounds.playBuzzer();
                setTimerExpired(true);
            }
        }, 100);

        return () => clearInterval(interval);
    }, [gameState?.timerEndTime]);

    // Memoize particle configs
    const theme = artist?.visual_theme;
    const thematicParticles = useMemo(() => {
        if (!theme) return null;
        return getThematicParticles(theme);
    }, [theme]);

    const ambientParticles = useMemo(() => ({
        fullScreen: { enable: false },
        fpsLimit: 60,
        particles: {
            number: { value: 30, density: { enable: true, area: 800 } },
            color: { value: "#ffffff" },
            shape: { type: "circle" },
            opacity: {
                value: { min: 0.1, max: 0.3 },
                animation: { enable: true, speed: 0.5, sync: false }
            },
            size: {
                value: { min: 1, max: 2 },
                animation: { enable: true, speed: 1, sync: false }
            },
            move: {
                enable: true,
                speed: 0.1,
                direction: "none" as const,
                random: true,
                straight: false,
                outModes: { default: "out" as const }
            }
        },
        detectRetina: false
    }), []);

    // Confetti particles for winner screen
    const confettiParticles = useMemo(() => ({
        fullScreen: { enable: false },
        fpsLimit: 60,
        particles: {
            number: { value: 200 },
            color: { value: ['#FFD700', '#FF4081', '#00E5FF', '#1db954', '#ff9800', '#9c27b0', '#ffffff'] },
            shape: { type: ['circle', 'square'] },
            opacity: { value: { min: 0.6, max: 1 } },
            size: { value: { min: 3, max: 8 } },
            move: {
                enable: true, speed: { min: 2, max: 8 }, direction: 'bottom' as const,
                random: true, straight: false,
                outModes: { default: 'out' as const, top: 'none' as const },
                gravity: { enable: true, acceleration: 3 }
            },
            rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 15, sync: false } },
            tilt: { enable: true, direction: 'random' as const, value: { min: 0, max: 360 }, animation: { enable: true, speed: 30 } }
        },
        detectRetina: false
    }), []);

    if (!gameState || !artist) {
        return (
            <div className="pre-load-screen">
                <div className="pre-load-content">
                    <div className="pre-load-glow" />
                    <h1 className="main-title">The Artist Unlocked</h1>
                    <div className="pre-load-divider" />
                    <p className="status-text">Waiting for Quizmaster to host a session...</p>
                    <div className="pre-load-dots">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                    </div>
                </div>
                <style>{`
                    .pre-load-screen {
                        min-height: 100vh;
                        background: radial-gradient(ellipse at 50% 40%, rgba(0, 229, 255, 0.06) 0%, #050505 70%);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        text-align: center;
                        color: #fff;
                        font-family: 'Outfit', sans-serif;
                        overflow: hidden;
                        position: relative;
                    }
                    .pre-load-glow {
                        position: absolute;
                        width: 400px;
                        height: 400px;
                        border-radius: 50%;
                        background: radial-gradient(circle, rgba(0, 229, 255, 0.08) 0%, transparent 70%);
                        animation: glow-pulse 4s ease-in-out infinite;
                        pointer-events: none;
                    }
                    @keyframes glow-pulse {
                        0%, 100% { transform: scale(1); opacity: 0.5; }
                        50% { transform: scale(1.3); opacity: 1; }
                    }
                    .pre-load-content {
                        position: relative;
                        z-index: 1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                    }
                    .main-title {
                        font-size: 3.5rem;
                        color: #00E5FF;
                        letter-spacing: 8px;
                        margin-bottom: 1.5rem;
                        text-transform: uppercase;
                        text-shadow: 0 0 40px rgba(0, 229, 255, 0.3), 0 0 80px rgba(0, 229, 255, 0.1);
                        animation: title-breathe 3s ease-in-out infinite;
                    }
                    @keyframes title-breathe {
                        0%, 100% { opacity: 1; text-shadow: 0 0 40px rgba(0, 229, 255, 0.3), 0 0 80px rgba(0, 229, 255, 0.1); }
                        50% { opacity: 0.85; text-shadow: 0 0 60px rgba(0, 229, 255, 0.5), 0 0 120px rgba(0, 229, 255, 0.15); }
                    }
                    .pre-load-divider {
                        width: 80px;
                        height: 2px;
                        background: linear-gradient(90deg, transparent, #00E5FF, transparent);
                        margin-bottom: 1.5rem;
                    }
                    .status-text {
                        color: rgba(255, 255, 255, 0.5);
                        font-size: 1rem;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                        margin-bottom: 1.5rem;
                    }
                    .pre-load-dots {
                        display: flex;
                        gap: 0.5rem;
                    }
                    .dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: #00E5FF;
                        animation: dot-bounce 1.4s ease-in-out infinite;
                    }
                    .dot:nth-child(2) { animation-delay: 0.2s; }
                    .dot:nth-child(3) { animation-delay: 0.4s; }
                    @keyframes dot-bounce {
                        0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                        40% { opacity: 1; transform: scale(1.2); }
                    }
                `}</style>
            </div>
        );
    }

    const isUnlockPhase = gameState.activeTier === 0;
    const question = isUnlockPhase ? null : artist.lore_ladder[gameState.activeTier - 1];

    // Resolve font family from theme
    const artistFont = FONT_MAP[theme?.font_style ?? ''] || "'Syncopate', sans-serif";

    const bgStyle = theme!.background_style || 'dark';
    const textEffectClass = theme?.text_effect && theme.text_effect !== 'none' ? `text-effect-${theme.text_effect}` : '';

    // Timer rendering helpers
    const timerSeconds = timerRemaining !== null ? Math.ceil(timerRemaining / 1000) : null;
    const timerIsUrgent = timerSeconds !== null && timerSeconds <= 10 && timerSeconds > 0;
    const timerProgress = gameState.timerEndTime && gameState.timerDuration
        ? Math.max(0, Math.min(1, (timerRemaining ?? 0) / (gameState.timerDuration * 1000)))
        : 0;
    const circumference = 2 * Math.PI * 60; // radius = 60

    return (
        <div className={`presentation-container ${flash ? 'flash-active' : ''} bg-${bgStyle}`} style={{
            '--primary-color': theme!.primary_color,
            '--secondary-color': theme!.secondary_color,
            '--primary-glow': `${theme!.primary_color}88`,
            '--artist-font': artistFont,
        } as React.CSSProperties}>

            {/* Fanart Background Layer */}
            {artist.fanart_backgrounds && artist.fanart_backgrounds.length > 0 && gameState.activeTier > 0 ? (
                <>
                    <div
                        className="bg-fanart-layer"
                        style={{
                            backgroundImage: `url(${artist.fanart_backgrounds[gameState.activeTier % artist.fanart_backgrounds.length]})`
                        }}
                    />
                    <div className="bg-gradient-layer fanart-blend"></div>
                </>
            ) : (
                <div className="bg-gradient-layer"></div>
            )}
            <div className="bg-vignette"></div>
            <div className="bg-noise"></div>
            <div className="bg-pattern"></div>

            {init && (
                <>
                    <Particles id="ambient-particles" options={ambientParticles} className="particle-layer" />
                    {thematicParticles && (
                        <Particles id="theme-particles" options={thematicParticles} className="particle-layer theme-layer" />
                    )}
                </>
            )}

            <div key={transitionKey} className="main-content question-transition">
                {/* Jeopardy Board Overlay */}
                {gameState.showBoard && (
                    <div className="board-overlay">
                        <div className="board-glass">
                            <h1 className="board-title">QUIZ PROGRESS BOARD</h1>
                            <div className="board-grid" style={{ gridTemplateColumns: `repeat(${gameState.quizData.length}, 1fr)` }}>
                                {gameState.quizData.map((a: QuizArtist, aIdx: number) => (
                                    <div key={aIdx} className={`board-column ${aIdx === gameState.activeArtistIndex ? 'active-column' : ''}`}>
                                        {/* Header / Unlock Combined: Prevents spoiler and saves a row */}
                                        {(() => {
                                            const isUnlocked = aIdx < gameState.activeArtistIndex || (aIdx === gameState.activeArtistIndex && gameState.activeTier > 0);
                                            const isCurrentUnlock = aIdx === gameState.activeArtistIndex && gameState.activeTier === 0;

                                            return (
                                                <div className={`board-category ${isUnlocked ? 'completed' : (isCurrentUnlock ? 'active' : '')}`}>
                                                    {isUnlocked ? a.artist : (isCurrentUnlock ? '🔓 UNLOCK' : `???`)}
                                                </div>
                                            );
                                        })()}

                                        {/* Lore Tiers */}
                                        {[1, 2, 3, 4, 5].map(t => {
                                            const isCompleted = aIdx < gameState.activeArtistIndex || (aIdx === gameState.activeArtistIndex && t < gameState.activeTier);
                                            const isActive = aIdx === gameState.activeArtistIndex && t === gameState.activeTier;
                                            return (
                                                <div key={t} className={`board-cell ${isCompleted ? 'completed' : (isActive ? 'active' : '')}`}>
                                                    {isCompleted ? '✅' : `${t * 10}`}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Header Section */}
                <header className="presentation-header">
                    <div className="artist-info">
                        <div className="round-badge">ROUND {gameState.activeArtistIndex + 1}</div>

                        {isUnlockPhase && !gameState.showAnswer ? (
                            <h1 className={`artist-name ${textEffectClass}`}>???</h1>
                        ) : artist.fanart_logo ? (
                            <div className="artist-logo-container">
                                <img src={artist.fanart_logo} alt={artist.artist} className="active-artist-logo" />
                            </div>
                        ) : (
                            <h1 className={`artist-name ${textEffectClass}`}>{artist.artist}</h1>
                        )}

                        <p className="genre-tag">{artist.genre}</p>
                    </div>

                    <div className="tier-display">
                        <div className={`tier-badge ${isUnlockPhase ? 'unlock' : ''}`}>
                            {isUnlockPhase ? 'UNLOCK' : `TIER ${gameState.activeTier}`}
                        </div>
                        {!isUnlockPhase && question && (
                            <div className="points-label">{question.points} <span>PTS</span></div>
                        )}
                    </div>
                </header>

                {/* Tokens/Notifications Area */}
                <div className="notifications-area">
                    {gameState.allInActive && (
                        <div className="all-in-banner">
                            <span className="fire-emoji">🔥</span>
                            ALL-IN TOKEN ACTIVE - DOUBLE POINTS
                            <span className="fire-emoji">🔥</span>
                        </div>
                    )}
                </div>

                {/* Question Card */}
                <main className="question-section">
                    <div className="glass-card question-card">
                        {isUnlockPhase ? (
                            <div className="unlock-phase-content">
                                <div className="music-icon-pulse">🎵</div>
                                <h2>IDENTIFY THE ARTIST</h2>
                                <p>Listen carefully to the audio clip...</p>
                                {gameState.showAnswer && (
                                    <div className="answer-reveal" ref={answerRef}>
                                        <div className="reveal-line"></div>
                                        <h3 className="answer-text">{artist.artist}</h3>
                                    </div>
                                )}
                            </div>
                        ) : question && (
                            <div className="lore-content">
                                <p className="spoken-hint">{question.spoken_hint}</p>
                                {gameState.showAnswer && (
                                    <div className="answer-reveal" ref={answerRef}>
                                        <div className="reveal-line"></div>
                                        <h3 className="answer-text">{question.answer}</h3>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>

                {/* Footer / Wagers */}
                <div style={{ minHeight: '100px', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                    {gameState.wagersLocked && !gameState.showAnswer && gameState.activeTier === 5 && gameState.activeArtistIndex === gameState.quizData.length -1 && (
                        <div className="wager-notification">
                            <span className="lock-icon">🔒</span> ALL WAGERS LOCKED IN!
                        </div>
                    )}
                </div>
            </div>

            {/* Timer Display */}
            {gameState.timerEndTime && timerSeconds !== null && (
                <div className={`timer-container ${timerIsUrgent ? 'timer-urgent' : ''}`}>
                    <div className="timer-circle">
                        <svg className="timer-svg" viewBox="0 0 140 140">
                            <circle className="timer-bg" cx="70" cy="70" r="60" />
                            <circle
                                className="timer-progress"
                                cx="70" cy="70" r="60"
                                stroke={timerIsUrgent ? '#ff4444' : (theme!.primary_color || '#00E5FF')}
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference * (1 - timerProgress)}
                            />
                        </svg>
                        {timerExpired ? (
                            <div className="timer-number timer-expired">TIME'S UP</div>
                        ) : (
                            <div className="timer-number" style={{ color: timerIsUrgent ? '#ff4444' : (theme!.primary_color || '#00E5FF') }}>
                                {timerSeconds}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Live Scoreboard */}
            {gameState.showLeaderboard && sortedTeams.length > 0 && (
                <aside className="scoreboard-sidebar">
                    <div className="scoreboard-glass">
                        <h3>LEADERBOARD</h3>
                        <div className="team-list">
                            {sortedTeams.map((t, i: number) => (
                                <div key={i} className={`team-row rank-${i+1} ${gameState.allInActive && t.allInUsed ? 'team-all-in' : ''}`}>
                                    <div className="team-rank">{i + 1}</div>
                                    <div className="team-name">
                                        {i === 0 && <span className="crown">👑</span>}
                                        {t.name}
                                        {teamLockins[t.name] !== undefined && !gameState.showAnswer && (
                                            <span className="lockin-indicator">
                                                {teamLockins[t.name] ? ' ✅' : ' ⏳'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="team-score">{t.score}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>
            )}

            {/* Winner Screen overlay */}
            {gameState.winnerMode && (
                <div className="winner-overlay">
                    {/* Confetti */}
                    {init && (
                        <div className="confetti-layer">
                            <Particles id="confetti-particles" options={confettiParticles} style={{ width: '100%', height: '100%' }} />
                        </div>
                    )}

                    <div className="winner-content">
                        <div className="trophy-icon">🏆</div>
                        <h1 className="winner-title">GRAND CHAMPIONS</h1>

                        {/* Podium for top 3 */}
                        {sortedTeams.length > 0 && (
                            <div className="podium-container">
                                {/* 2nd place (left) */}
                                {sortedTeams.length > 1 && (
                                    <div className="podium-place podium-2nd">
                                        <div className="podium-name">{sortedTeams[1].name}</div>
                                        <div className="podium-bar">
                                            <div className="podium-rank">2nd</div>
                                            <div className="podium-score"><AnimatedScore target={sortedTeams[1].score} /></div>
                                        </div>
                                    </div>
                                )}
                                {/* 1st place (center) */}
                                <div className="podium-place podium-1st">
                                    <div className="podium-name">{sortedTeams[0].name}</div>
                                    <div className="podium-bar">
                                        <div className="podium-rank">1st</div>
                                        <div className="podium-score"><AnimatedScore target={sortedTeams[0].score} /></div>
                                    </div>
                                </div>
                                {/* 3rd place (right) */}
                                {sortedTeams.length > 2 && (
                                    <div className="podium-place podium-3rd">
                                        <div className="podium-name">{sortedTeams[2].name}</div>
                                        <div className="podium-bar">
                                            <div className="podium-rank">3rd</div>
                                            <div className="podium-score"><AnimatedScore target={sortedTeams[2].score} /></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Remaining standings below podium */}
                        {sortedTeams.length > 3 && (
                            <div className="remaining-standings">
                                {sortedTeams.slice(3).map((t, i) => (
                                    <div key={i} className="remaining-item">
                                        <div className="standing-rank" style={{ fontSize: '1.2rem', opacity: 0.4 }}>#{i + 4}</div>
                                        <div className="standing-name" style={{ fontSize: '1.8rem', fontWeight: 900 }}>{t.name}</div>
                                        <div className="standing-score" style={{ fontSize: '2.5rem', fontWeight: 900, color: '#00E5FF' }}>
                                            <AnimatedScore target={t.score} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Lobby Overlay */}
            {gameState.lobbyMode && (
                <div className="lobby-overlay">
                    <div className="lobby-content">
                        <h1 className="lobby-title">JOIN THE GAME!</h1>
                        <p className="lobby-subtitle">Scan the QR code with your phone</p>

                        {playerQrDataUrl && gameState.showPlayerQr && (
                            <div className="lobby-qr">
                                <img src={playerQrDataUrl} alt="Join QR Code" />
                            </div>
                        )}

                        {lobbyTeams.length > 0 && (
                            <div className="lobby-teams">
                                <h3>Teams Joined ({lobbyTeams.length})</h3>
                                <div className="lobby-team-list">
                                    {lobbyTeams.map((name, i) => (
                                        <div
                                            key={i}
                                            className={`lobby-team-chip ${name === newTeamFlash ? 'team-flash' : ''}`}
                                        >
                                            {name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=${FONT_IMPORTS}&display=swap');

                .presentation-container {
                    color: #fff;
                    min-height: 100vh;
                    position: relative;
                    overflow: hidden;
                    font-family: 'Outfit', sans-serif;
                    background: #050505;
                }

                /* ---- Background Layers ---- */

                .bg-gradient-layer {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: radial-gradient(circle at 20% 30%, var(--primary-color)55 0%, transparent 45%),
                                radial-gradient(circle at 80% 70%, var(--secondary-color)55 0%, transparent 45%);
                    z-index: 0;
                }

                .bg-fanart-layer {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background-size: cover;
                    background-position: center;
                    background-repeat: no-repeat;
                    z-index: 0;
                    opacity: 0.4;
                    mix-blend-mode: luminosity;
                    filter: contrast(1.2) brightness(0.8);
                }

                .bg-gradient-layer.fanart-blend {
                    background: radial-gradient(circle at 20% 30%, var(--primary-color)88 0%, transparent 60%),
                                radial-gradient(circle at 80% 70%, var(--secondary-color)88 0%, transparent 60%);
                    mix-blend-mode: overlay;
                    opacity: 0.9;
                }

                .bg-vignette {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%);
                    z-index: 0;
                    pointer-events: none;
                }

                .bg-noise {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    z-index: 0;
                    pointer-events: none;
                    opacity: 0.035;
                    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
                    background-repeat: repeat;
                    background-size: 256px 256px;
                    mix-blend-mode: overlay;
                }

                .bg-pattern {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    z-index: 0;
                    pointer-events: none;
                    opacity: 0;
                }

                /* Background style: gradient (enhanced) */
                .bg-gradient .bg-gradient-layer {
                    background: radial-gradient(circle at 15% 25%, var(--primary-color)77 0%, transparent 50%),
                                radial-gradient(circle at 85% 75%, var(--secondary-color)77 0%, transparent 50%),
                                radial-gradient(circle at 50% 50%, var(--primary-color)22 0%, transparent 70%);
                }

                /* Background style: smoky */
                .bg-smoky .bg-gradient-layer {
                    background: radial-gradient(ellipse at 25% 40%, var(--primary-color)66 0%, transparent 50%),
                                radial-gradient(ellipse at 75% 60%, var(--secondary-color)66 0%, transparent 50%),
                                radial-gradient(ellipse at 50% 20%, var(--primary-color)33 0%, transparent 60%);
                    animation: smokyDrift 20s ease-in-out infinite alternate;
                }

                @keyframes smokyDrift {
                    0% { transform: scale(1) translate(0, 0); }
                    50% { transform: scale(1.1) translate(-2%, 3%); }
                    100% { transform: scale(1.05) translate(2%, -2%); }
                }

                /* Background style: grid-overlay */
                .bg-grid-overlay .bg-pattern {
                    opacity: 0.06;
                    background-image:
                        linear-gradient(var(--primary-color)44 1px, transparent 1px),
                        linear-gradient(90deg, var(--primary-color)44 1px, transparent 1px);
                    background-size: 60px 60px;
                }

                /* Background style: scanlines (CRT effect) */
                .bg-scanlines .bg-pattern {
                    opacity: 1;
                    background-image: repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 3px,
                        rgba(0,0,0,0.18) 3px,
                        rgba(0,0,0,0.18) 4px
                    );
                }

                /* Background style: diagonal-stripe */
                .bg-diagonal-stripe .bg-pattern {
                    opacity: 0.07;
                    background-image: repeating-linear-gradient(
                        45deg,
                        var(--primary-color),
                        var(--primary-color) 2px,
                        transparent 2px,
                        transparent 22px
                    );
                }

                /* Background style: vignette-burst */
                .bg-vignette-burst .bg-gradient-layer {
                    background: radial-gradient(ellipse 60% 70% at 50% 40%, var(--primary-color)99 0%, var(--secondary-color)44 35%, transparent 70%);
                }
                .bg-vignette-burst .bg-vignette {
                    background: radial-gradient(ellipse at center, transparent 15%, rgba(0,0,0,0.92) 100%);
                }

                /* Background style: neon-border */
                .bg-neon-border .bg-pattern {
                    opacity: 1;
                    box-shadow:
                        inset 0 0 60px color-mix(in srgb, var(--primary-color) 45%, transparent),
                        inset 0 0 120px color-mix(in srgb, var(--secondary-color) 20%, transparent);
                    border: 2px solid var(--primary-color);
                }

                /* ---- Particle Layers ---- */

                .particle-layer {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    z-index: 1;
                    pointer-events: none;
                }

                .flash-active::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: #fff;
                    opacity: 0.15;
                    z-index: 20;
                    pointer-events: none;
                }

                /* ---- Main Content ---- */

                .main-content {
                    position: relative;
                    z-index: 10;
                    padding: 4rem;
                    max-width: 1400px;
                    margin: 0 auto;
                    display: grid;
                    grid-template-rows: auto auto 1fr auto;
                    min-height: 100vh;
                }

                /* ---- Header ---- */

                .presentation-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 2rem;
                }

                .artist-name {
                    font-family: var(--artist-font, 'Syncopate', sans-serif);
                    font-size: 4.5rem;
                    margin: 0;
                    text-transform: uppercase;
                    color: var(--primary-color);
                    text-shadow: 0 0 40px var(--primary-glow),
                                 0 0 80px var(--primary-glow),
                                 0 2px 4px rgba(0,0,0,0.8);
                    letter-spacing: -2px;
                    -webkit-text-stroke: 1px rgba(255,255,255,0.1);
                }

                /* ---- Text Effects ---- */

                .artist-name.text-effect-glow {
                    animation: glowPulse 3s ease-in-out infinite;
                }
                @keyframes glowPulse {
                    0%, 100% { text-shadow: 0 0 30px var(--primary-glow), 0 0 60px var(--primary-glow), 0 2px 4px rgba(0,0,0,0.8); }
                    50% { text-shadow: 0 0 60px var(--primary-glow), 0 0 120px var(--primary-glow), 0 0 20px var(--secondary-color), 0 2px 4px rgba(0,0,0,0.8); }
                }

                .artist-name.text-effect-neon {
                    text-shadow:
                        0 0 7px #fff,
                        0 0 21px #fff,
                        0 0 42px var(--primary-color),
                        0 0 82px var(--primary-color),
                        0 0 102px var(--secondary-color),
                        0 0 151px var(--secondary-color);
                }

                .artist-name.text-effect-retro-3d {
                    text-shadow:
                        3px 3px 0 var(--secondary-color),
                        6px 6px 0 rgba(0,0,0,0.4);
                }

                .artist-name.text-effect-stamp {
                    transform: rotate(-1.5deg) skewX(1deg);
                    text-shadow: 2px 2px 0 rgba(0,0,0,0.8);
                    filter: contrast(1.1);
                    display: inline-block;
                }

                .artist-logo-container {
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    height: 120px;
                    margin: 0.5rem 0;
                }

                .active-artist-logo {
                    max-height: 100%;
                    max-width: 600px;
                    object-fit: contain;
                    filter: drop-shadow(0 0 20px var(--primary-glow)) drop-shadow(0 5px 15px rgba(0,0,0,0.8));
                    animation: floatLogo 6s ease-in-out infinite;
                }

                @keyframes floatLogo {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }

                .round-badge {
                    display: inline-block;
                    background: rgba(255,255,255,0.15);
                    border: 1px solid rgba(255,255,255,0.25);
                    padding: 0.3rem 1rem;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    font-weight: 900;
                    letter-spacing: 3px;
                    margin-bottom: 0.5rem;
                }

                .genre-tag {
                    font-size: 1.5rem;
                    color: rgba(255,255,255,0.75);
                    text-transform: uppercase;
                    letter-spacing: 5px;
                    margin: 0.5rem 0 0 0;
                }

                /* ---- Tier Badge ---- */

                .tier-badge {
                    background: var(--primary-color);
                    color: #fff;
                    padding: 0.8rem 2.5rem;
                    font-size: 2.2rem;
                    font-weight: 900;
                    border-radius: 50px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
                    font-family: var(--artist-font, 'Syncopate', sans-serif);
                    text-align: center;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.5);
                }

                .tier-badge.unlock {
                    background: #1db954;
                    color: #fff;
                }

                .points-label {
                    text-align: right;
                    font-size: 2.5rem;
                    font-weight: 900;
                    margin-top: 0.5rem;
                    color: var(--secondary-color);
                    text-shadow: 0 0 20px var(--secondary-color);
                }

                .points-label span {
                    font-size: 1.2rem;
                    opacity: 0.5;
                }

                /* ---- Question Card ---- */

                .question-section {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2rem 0;
                }

                .glass-card {
                    background: rgba(255, 255, 255, 0.06);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-left: 4px solid var(--primary-color);
                    border-radius: 3rem;
                    padding: 4rem;
                    width: 100%;
                    box-shadow: 0 40px 100px rgba(0,0,0,0.6);
                    position: relative;
                    overflow: hidden;
                }

                .spoken-hint {
                    font-size: 3.2rem;
                    line-height: 1.2;
                    margin: 0;
                    font-weight: 400;
                    text-align: center;
                    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
                }

                .answer-reveal {
                    margin-top: 4rem;
                    text-align: center;
                    animation: slideUpReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1);
                }

                .reveal-line {
                    height: 2px;
                    background: linear-gradient(90deg, transparent, var(--primary-color), transparent);
                    margin-bottom: 3rem;
                }

                .answer-text {
                    font-size: 5rem;
                    font-family: var(--artist-font, 'Syncopate', sans-serif);
                    margin: 0;
                    color: var(--primary-color);
                    text-shadow: 0 0 40px var(--primary-glow),
                                 0 0 80px var(--primary-glow);
                }

                .music-icon-pulse {
                    font-size: 6rem;
                    margin-bottom: 2rem;
                    animation: floatPulse 3s infinite ease-in-out;
                    text-align: center;
                }

                /* ---- Scoreboard Sidebar ---- */

                .scoreboard-sidebar {
                    position: fixed;
                    right: 3rem;
                    bottom: 3rem;
                    z-index: 50;
                    width: 380px;
                }

                .scoreboard-glass {
                    background: rgba(10,10,20,0.9);
                    backdrop-filter: blur(15px);
                    border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
                    border-radius: 2rem;
                    padding: 2rem;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.8),
                               0 0 30px color-mix(in srgb, var(--primary-color) 10%, transparent);
                }

                .scoreboard-glass h3 {
                    margin: 0 0 1.5rem 0;
                    text-align: center;
                    font-family: 'Syncopate', sans-serif;
                    letter-spacing: 4px;
                    font-size: 1.1rem;
                    color: var(--secondary-color);
                }

                .team-row {
                    display: flex;
                    align-items: center;
                    padding: 1rem;
                    margin-bottom: 0.5rem;
                    background: rgba(255,255,255,0.03);
                    border-radius: 12px;
                    transition: all 0.3s ease;
                }

                .rank-1 { background: rgba(255, 215, 0, 0.1); border: 1px solid rgba(255, 215, 0, 0.2); }

                .team-rank {
                    width: 30px;
                    font-weight: 900;
                    opacity: 0.4;
                }

                .team-name {
                    flex: 1;
                    font-size: 1.4rem;
                    font-weight: 600;
                }

                .team-score {
                    font-size: 1.6rem;
                    font-weight: 900;
                    color: var(--secondary-color);
                }

                .team-all-in {
                    animation: rowPulse 1.5s infinite;
                    background: rgba(255, 193, 7, 0.15);
                    border: 1px solid rgba(255, 193, 7, 0.4);
                }

                /* ---- Notifications ---- */

                .all-in-banner {
                    background: linear-gradient(90deg, #ffc107, #ff9800);
                    color: #000;
                    padding: 1rem 3rem;
                    border-radius: 12px;
                    font-weight: 900;
                    font-size: 1.8rem;
                    display: inline-block;
                    margin-bottom: 2rem;
                    animation: bannerPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: 0 10px 30px rgba(255,152,0,0.4);
                }

                .wager-notification {
                    background: #ff4444;
                    padding: 1rem 3rem;
                    border-radius: 100px;
                    font-weight: 900;
                    font-size: 1.5rem;
                    display: inline-block;
                    box-shadow: 0 0 40px rgba(255,68,68,0.5);
                }

                /* ---- Winner ---- */

                .winner-overlay {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: #000;
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .winner-content {
                    text-align: center;
                    width: 90%;
                    max-width: 1200px;
                    animation: winnerEntrance 1.5s ease-out;
                }

                .trophy-icon { font-size: 8rem; margin-bottom: 1rem; }
                .winner-title { font-family: 'Syncopate', sans-serif; font-size: 5rem; color: #FFD700; }
                .top-team-name { font-size: 7rem; margin: 1rem 0; font-weight: 900; }
                .top-team-score { font-size: 3rem; color: var(--secondary-color); }

                /* ---- Animations ---- */

                @keyframes slideUpReveal {
                    from { opacity: 0; transform: translateY(50px) scale(0.9); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                @keyframes floatPulse {
                    0% { transform: translateY(0) scale(1); }
                    50% { transform: translateY(-20px) scale(1.1); }
                    100% { transform: translateY(0) scale(1); }
                }

                @keyframes rowPulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.03); }
                    100% { transform: scale(1); }
                }

                @keyframes bannerPop {
                    from { transform: scale(0.5) rotate(-5deg); opacity: 0; }
                    to { transform: scale(1) rotate(0); opacity: 1; }
                }

                @keyframes winnerEntrance {
                    from { opacity: 0; transform: scale(0.8); }
                    to { opacity: 1; transform: scale(1); }
                }

                /* ---- Board Styles ---- */

                .board-overlay {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.88);
                    z-index: 100;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.5s ease-out;
                    backdrop-filter: blur(10px);
                }

                .board-glass {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 3rem;
                    padding: 3rem;
                    width: 90%;
                    max-width: 1400px;
                    box-shadow: 0 50px 100px rgba(0,0,0,0.5);
                }

                .board-title {
                    text-align: center;
                    font-family: 'Syncopate', sans-serif;
                    font-size: 2.5rem;
                    margin-bottom: 3rem;
                    color: var(--secondary-color);
                    letter-spacing: 10px;
                    text-shadow: 0 0 20px var(--secondary-color);
                }

                .board-grid {
                    display: grid;
                    gap: 1.5rem;
                }

                .board-column {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .board-category {
                    background: rgba(255,255,255,0.12);
                    padding: 1.2rem 1rem;
                    text-align: center;
                    font-weight: 900;
                    font-size: 1.1rem;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    border-radius: 12px;
                    min-height: 70px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid rgba(255,255,255,0.15);
                }

                .active-column .board-category {
                    border-color: var(--primary-color);
                    box-shadow: 0 0 15px color-mix(in srgb, var(--primary-color) 30%, transparent);
                }

                .board-category.active {
                    background: var(--primary-color);
                    color: #fff;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.5);
                    box-shadow: 0 0 30px var(--primary-glow);
                }

                .board-category.completed {
                    opacity: 0.6;
                    border-color: var(--primary-color);
                }

                .board-cell {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.12);
                    aspect-ratio: 16/9;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2.5rem;
                    font-weight: 900;
                    color: #f39c12;
                    border-radius: 8px;
                    transition: all 0.3s ease;
                    text-shadow: 0 0 10px rgba(243, 156, 18, 0.3);
                }

                .active-column .board-cell {
                    border-color: rgba(255,255,255,0.2);
                }

                .board-cell.unlock-cell {
                    font-size: 1rem;
                    letter-spacing: 2px;
                }

                .board-cell.active {
                    background: var(--secondary-color);
                    color: #000;
                    border-color: #fff;
                    transform: scale(1.05);
                    box-shadow: 0 0 40px var(--secondary-color);
                    z-index: 2;
                    text-shadow: none;
                }

                .board-cell.completed {
                    background: rgba(255,255,255,0.04);
                    border-color: rgba(255,255,255,0.08);
                    color: rgba(255,255,255,0.35);
                    font-size: 1.5rem;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                /* ---- Question Transition ---- */
                .question-transition {
                    animation: questionSwap 0.5s ease-out;
                }

                @keyframes questionSwap {
                    0% { opacity: 0; transform: translateY(20px) scale(0.98); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }

                /* ---- Timer ---- */

                .timer-container {
                    position: fixed;
                    bottom: 3rem;
                    left: 3rem;
                    z-index: 50;
                    width: 140px;
                    height: 140px;
                }
                .timer-circle { position: relative; width: 100%; height: 100%; }
                .timer-svg { width: 100%; height: 100%; transform: rotate(-90deg); }
                .timer-bg { fill: none; stroke: rgba(255,255,255,0.1); stroke-width: 4; }
                .timer-progress { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke 0.3s; }
                .timer-number {
                    position: absolute; top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 3rem; font-weight: 900;
                    font-family: 'Syncopate', sans-serif;
                    text-shadow: 0 0 20px currentColor;
                }
                .timer-urgent .timer-number {
                    color: #ff4444;
                    animation: timerPulse 0.5s infinite;
                }
                .timer-urgent .timer-progress { stroke: #ff4444; }
                .timer-expired {
                    animation: timerExpired 0.3s ease-out forwards;
                    color: #ff4444;
                    font-size: 1.2rem;
                    text-align: center;
                    white-space: nowrap;
                }
                @keyframes timerPulse {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); }
                    50% { transform: translate(-50%, -50%) scale(1.3); }
                }
                @keyframes timerExpired {
                    from { transform: translate(-50%, -50%) scale(1.5); opacity: 1; }
                    to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                }

                /* ---- Confetti & Podium ---- */

                .confetti-layer {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    z-index: 999;
                    pointer-events: none;
                }
                .podium-container {
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                    gap: 1rem;
                    margin: 3rem 0;
                    min-height: 300px;
                }
                .podium-place {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    animation: podiumRise 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
                }
                .podium-place:nth-child(1) { animation-delay: 0.3s; }
                .podium-place:nth-child(2) { animation-delay: 0s; }
                .podium-place:nth-child(3) { animation-delay: 0.6s; }
                .podium-bar {
                    width: 180px;
                    border-radius: 12px 12px 0 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-end;
                    padding: 1.5rem 1rem;
                }
                .podium-1st .podium-bar { height: 250px; background: linear-gradient(180deg, #FFD700, #b8860b); }
                .podium-2nd .podium-bar { height: 180px; background: linear-gradient(180deg, #C0C0C0, #808080); }
                .podium-3rd .podium-bar { height: 130px; background: linear-gradient(180deg, #CD7F32, #8B4513); }
                .podium-rank { font-size: 3rem; font-weight: 900; margin-bottom: 0.5rem; }
                .podium-name { font-size: 1.4rem; font-weight: 700; margin-bottom: 0.3rem; }
                .podium-score { font-size: 2rem; font-weight: 900; }
                @keyframes podiumRise {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .remaining-standings {
                    margin-top: 2rem;
                    display: flex;
                    gap: 2rem;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                .remaining-item {
                    text-align: center;
                    padding: 1rem 2rem;
                    background: rgba(255,255,255,0.05);
                    border-radius: 12px;
                }

                /* Lock-in indicator */
                .lockin-indicator {
                    font-size: 0.8em;
                    margin-left: 0.3rem;
                }

                /* Lobby overlay */
                .lobby-overlay {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    z-index: 50;
                    background: rgba(0, 0, 0, 0.9);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                }

                .lobby-content {
                    max-width: 700px;
                    padding: 2rem;
                }

                .lobby-title {
                    font-size: 4rem;
                    color: #00E5FF;
                    text-transform: uppercase;
                    letter-spacing: 5px;
                    margin-bottom: 0.5rem;
                    text-shadow: 0 0 30px rgba(0, 229, 255, 0.5);
                }

                .lobby-subtitle {
                    font-size: 1.5rem;
                    color: rgba(255, 255, 255, 0.7);
                    margin-bottom: 2rem;
                }

                .lobby-qr img {
                    width: 300px;
                    border-radius: 16px;
                    background: #fff;
                    padding: 1rem;
                    box-shadow: 0 20px 60px rgba(0, 229, 255, 0.3);
                }

                .lobby-teams {
                    margin-top: 2.5rem;
                }

                .lobby-teams h3 {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 1.2rem;
                    margin-bottom: 1rem;
                }

                .lobby-team-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.75rem;
                    justify-content: center;
                }

                .lobby-team-chip {
                    background: rgba(0, 229, 255, 0.15);
                    border: 1px solid rgba(0, 229, 255, 0.3);
                    padding: 0.6rem 1.5rem;
                    border-radius: 50px;
                    font-weight: bold;
                    font-size: 1.1rem;
                    color: #fff;
                    transition: all 0.3s;
                }

                .lobby-team-chip.team-flash {
                    animation: teamJoinFlash 0.6s ease;
                    background: rgba(0, 229, 255, 0.4);
                    border-color: #00E5FF;
                }

                @keyframes teamJoinFlash {
                    0% { transform: scale(0.5); opacity: 0; }
                    50% { transform: scale(1.15); }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

function getThematicParticles(theme: QuizArtist['visual_theme']) {
    const type = theme.animation_type;
    const color = theme.primary_color || '#00E5FF';
    const secondary = theme.secondary_color || '#ffffff';

    const baseConfig = {
        fullScreen: { enable: false },
        fpsLimit: 60,
        particles: {
            color: { value: color },
            move: { enable: true, speed: 1.5 },
            number: { value: 30, density: { enable: true } },
            opacity: { value: 0.4 },
            size: { value: { min: 1, max: 3 } }
        },
        detectRetina: false
    };

    switch (type) {
        case 'lightning':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 25 },
                    color: { value: [color, secondary, '#ffffff'] },
                    links: {
                        enable: true,
                        color: color,
                        distance: 150,
                        opacity: 0.4,
                        width: 1,
                        triangles: { enable: true, opacity: 0.05 }
                    },
                    move: { ...baseConfig.particles.move, speed: 4, outModes: "bounce" as const },
                    size: { value: { min: 1, max: 3 } }
                }
            };
        case 'bubbles':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    color: { value: [color, secondary] },
                    shape: { type: "circle" },
                    number: { value: 20 },
                    size: { value: { min: 8, max: 30 } },
                    move: { ...baseConfig.particles.move, speed: 1, direction: "top" as const, outModes: "out" as const },
                    opacity: { value: { min: 0.05, max: 0.2 }, animation: { enable: true, speed: 0.5, minimumValue: 0.05 } },
                    stroke: { width: 1, color: { value: color }, opacity: 0.2 }
                }
            };
        case 'neon_grid':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    shape: { type: "square" },
                    number: { value: 30 },
                    color: { value: [color, secondary] },
                    links: { enable: true, color: color, distance: 200, opacity: 0.3, width: 1 },
                    move: { ...baseConfig.particles.move, speed: 0.6, outModes: "out" as const },
                    opacity: { value: 0.5 },
                    size: { value: { min: 2, max: 4 } }
                }
            };
        case 'spotlight':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 5 },
                    color: { value: [color, secondary, '#ffffff'] },
                    size: { value: { min: 80, max: 200 } },
                    opacity: { value: { min: 0.02, max: 0.1 }, animation: { enable: true, speed: 0.3, minimumValue: 0.02 } },
                    move: { ...baseConfig.particles.move, speed: 0.2, direction: "none" as const, random: true, outModes: "bounce" as const },
                    shape: { type: "circle" }
                }
            };
        case 'equalizers':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    shape: { type: "square" },
                    number: { value: 50 },
                    color: { value: [color, secondary] },
                    size: { value: { min: 2, max: 6 } },
                    move: {
                        enable: true,
                        speed: { min: 1, max: 10 },
                        direction: "top" as const,
                        outModes: "out" as const,
                        random: false,
                        straight: true
                    },
                    opacity: { value: { min: 0.2, max: 0.6 } }
                }
            };
        case 'floating_notes':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 15 },
                    color: { value: [color, secondary, '#ffffff'] },
                    shape: {
                        type: "char",
                        options: {
                            char: { value: ["♪", "♫", "♩", "♬", "♭", "♮"], font: "Verdana", weight: "400" }
                        }
                    },
                    size: { value: { min: 12, max: 28 } },
                    move: { ...baseConfig.particles.move, speed: 1.2, direction: "top-right" as const, outModes: "out" as const },
                    rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 3 } },
                    opacity: { value: { min: 0.2, max: 0.5 } }
                }
            };
        case 'grunge_static':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 150 },
                    color: { value: [color, '#ffffff', '#888888'] },
                    shape: { type: "square" },
                    size: { value: { min: 1, max: 2 } },
                    move: { ...baseConfig.particles.move, speed: 15, direction: "none" as const, random: true },
                    opacity: { value: { min: 0.05, max: 0.4 }, animation: { enable: true, speed: 10 } }
                }
            };
        case 'embers':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 45 },
                    color: { value: [color, secondary, '#FF6B35', '#FFD700'] },
                    shape: { type: "circle" },
                    size: { value: { min: 1, max: 5 } },
                    move: {
                        enable: true,
                        speed: { min: 1, max: 4 },
                        direction: "top" as const,
                        outModes: "out" as const,
                        random: true,
                        straight: false
                    },
                    opacity: { value: { min: 0.1, max: 0.8 }, animation: { enable: true, speed: 2, minimumValue: 0.1 } }
                }
            };
        case 'galaxy':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 90 },
                    color: { value: [color, secondary, '#ffffff', '#ccccff', '#ffeecc'] },
                    shape: { type: "circle" },
                    size: { value: { min: 0.5, max: 2.5 } },
                    move: {
                        enable: true,
                        speed: 0.25,
                        direction: "none" as const,
                        outModes: "out" as const,
                        random: true
                    },
                    opacity: { value: { min: 0.2, max: 1.0 }, animation: { enable: true, speed: 0.4, minimumValue: 0.2 } }
                }
            };
        case 'rain':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 70 },
                    color: { value: [color, secondary, '#ffffff'] },
                    shape: { type: "circle" },
                    size: { value: { min: 1, max: 2 } },
                    move: {
                        enable: true,
                        speed: { min: 10, max: 18 },
                        direction: "bottom" as const,
                        outModes: "out" as const,
                        straight: true
                    },
                    opacity: { value: { min: 0.1, max: 0.45 } }
                }
            };
        case 'vinyl':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 18 },
                    color: { value: color },
                    shape: { type: "circle" },
                    size: { value: { min: 20, max: 110 } },
                    move: {
                        enable: true,
                        speed: 0.3,
                        direction: "none" as const,
                        outModes: "bounce" as const,
                        random: true
                    },
                    opacity: { value: { min: 0.02, max: 0.1 }, animation: { enable: true, speed: 1, minimumValue: 0.02 } },
                    stroke: { width: 1, color: { value: [color, secondary] }, opacity: 0.35 }
                }
            };
        case 'glitch':
            return {
                ...baseConfig,
                particles: {
                    ...baseConfig.particles,
                    number: { value: 80 },
                    color: { value: [color, secondary, '#ffffff', '#ff0044', '#00ffee'] },
                    shape: { type: "square" },
                    size: { value: { min: 1, max: 9 } },
                    move: {
                        enable: true,
                        speed: { min: 5, max: 22 },
                        direction: "none" as const,
                        outModes: "out" as const,
                        random: true,
                        straight: false
                    },
                    opacity: { value: { min: 0, max: 0.85 }, animation: { enable: true, speed: 25, minimumValue: 0 } }
                }
            };
        default:
            return baseConfig;
    }
}

export default Presentation;
