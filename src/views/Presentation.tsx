import React, { useEffect, useState, useMemo } from 'react';
// @ts-ignore
import Particles, { initParticlesEngine } from '@tsparticles/react';
// @ts-ignore
import { loadFull } from 'tsparticles';

const getApi = () => {
    // @ts-ignore
    if (window.electronAPI) return window.electronAPI;
    return { onStateUpdate: () => { } };
};

// Font style mapping
const FONT_MAP: Record<string, string> = {
    heavy: "'Bebas Neue', sans-serif",
    elegant: "'Playfair Display', serif",
    grunge: "'Rock Salt', cursive",
    retro: "'Press Start 2P', monospace",
};

const FONT_IMPORTS = [
    'Syncopate:wght@400;700',
    'Outfit:wght@300;400;700;900',
    'Bebas+Neue',
    'Playfair+Display:wght@400;700;900',
    'Rock+Salt',
    'Press+Start+2P',
].join('&family=');

const Presentation: React.FC = () => {
    const [gameState, setGameState] = useState<any>(null);
    const [init, setInit] = useState(false);
    const [flash, setFlash] = useState(false);
    const answerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        let isMounted = true;
        initParticlesEngine(async (engine) => {
            await loadFull(engine);
        }).then(() => {
            if (isMounted) setInit(true);
        });

        getApi().onStateUpdate((newState: any) => {
            if (isMounted) setGameState(newState);
        });

        return () => { isMounted = false; };
    }, []);

    // Scroll to top on step change
    useEffect(() => {
        if (gameState) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
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
        if (!gameState) return;
        const artist = gameState.quizData[gameState.activeArtistIndex];
        if (artist?.visual_theme?.animation_type !== 'lightning') return;

        let isMounted = true;
        let timer: NodeJS.Timeout;

        const triggerFlash = () => {
            if (!isMounted) return;
            setFlash(true);
            setTimeout(() => { if (isMounted) setFlash(false); }, 100 + Math.random() * 200);
            
            // Randomly trigger a double flash
            if (Math.random() > 0.7) {
                setTimeout(() => {
                    if (!isMounted) return;
                    setFlash(true);
                    setTimeout(() => { if (isMounted) setFlash(false); }, 50 + Math.random() * 100);
                }, 300);
            }
            
            scheduleNext();
        };

        const scheduleNext = () => {
            if (!isMounted) return;
            const delay = 3000 + Math.random() * 8000;
            timer = setTimeout(triggerFlash, delay);
        };

        scheduleNext();
        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [gameState]);

    const artist = useMemo(() => {
        if (!gameState || !gameState.quizData.length) return null;
        return gameState.quizData[gameState.activeArtistIndex];
    }, [gameState]);

    if (!gameState || !artist) {
        return (
            <div className="pre-load-screen">
                <div className="pre-load-content">
                    <h1 className="main-title">The Artist Unlocked</h1>
                    <div className="loader"></div>
                    <p className="status-text">Waiting for Quizmaster to host a session...</p>
                </div>
                <style>{`
                    .pre-load-screen {
                        min-height: 100vh;
                        background: #050505;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        text-align: center;
                        color: #fff;
                        font-family: 'Outfit', sans-serif;
                    }
                    .main-title {
                        font-size: 3rem;
                        color: #00E5FF;
                        letter-spacing: 5px;
                        margin-bottom: 2rem;
                        text-transform: uppercase;
                    }
                    .loader {
                        width: 50px; height: 50px;
                        border: 3px solid rgba(255,255,255,0.1);
                        border-top-color: #00E5FF;
                        border-radius: 50%;
                        margin: 0 auto 1.5rem;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    const isUnlockPhase = gameState.activeTier === 0;
    const question = isUnlockPhase ? null : artist.lore_ladder[gameState.activeTier - 1];
    const theme = artist.visual_theme;

    // Resolve font family from theme
    const artistFont = FONT_MAP[theme.font_style] || "'Syncopate', sans-serif";

    const ambientParticles = {
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
                direction: "none",
                random: true,
                straight: false,
                outModes: { default: "out" }
            }
        },
        detectRetina: false
    };

    const getThematicParticles = (theme: any) => {
        const type = theme.animation_type;
        const color = theme.primary_color || '#00E5FF';
        const secondary = theme.secondary_color || '#ffffff';
        
        const baseConfig: any = {
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
                        move: { ...baseConfig.particles.move, speed: 4, outModes: "bounce" },
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
                        move: { ...baseConfig.particles.move, speed: 1, direction: "top", outModes: "out" },
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
                        move: { ...baseConfig.particles.move, speed: 0.6, outModes: "out" },
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
                        move: { ...baseConfig.particles.move, speed: 0.2, direction: "random", outModes: "bounce" },
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
                            direction: "top", 
                            outModes: "out",
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
                        move: { ...baseConfig.particles.move, speed: 1.2, direction: "top-right", outModes: "out" },
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
                        move: { ...baseConfig.particles.move, speed: 15, direction: "none", random: true },
                        opacity: { value: { min: 0.05, max: 0.4 }, animation: { enable: true, speed: 10 } }
                    }
                };
            default:
                return baseConfig;
        }
    };

    const bgStyle = theme.background_style || 'dark';

    return (
        <div className={`presentation-container ${flash ? 'flash-active' : ''} bg-${bgStyle}`} style={{
            '--primary-color': theme.primary_color,
            '--secondary-color': theme.secondary_color,
            '--primary-glow': `${theme.primary_color}88`,
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
                    <Particles id="ambient-particles" options={ambientParticles as any} className="particle-layer" />
                    <Particles id="theme-particles" options={getThematicParticles(theme) as any} className="particle-layer theme-layer" />
                </>
            )}

            <div className="main-content">
                {/* Jeopardy Board Overlay */}
                {gameState.showBoard && (
                    <div className="board-overlay">
                        <div className="board-glass">
                            <h1 className="board-title">QUIZ PROGRESS BOARD</h1>
                            <div className="board-grid" style={{ gridTemplateColumns: `repeat(${gameState.quizData.length}, 1fr)` }}>
                                {gameState.quizData.map((a: any, aIdx: number) => (
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
                        
                        {isUnlockPhase ? (
                            <h1 className="artist-name">???</h1>
                        ) : artist.fanart_logo ? (
                            <div className="artist-logo-container">
                                <img src={artist.fanart_logo} alt={artist.artist} className="active-artist-logo" />
                            </div>
                        ) : (
                            <h1 className="artist-name">{artist.artist}</h1>
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

            {/* Live Scoreboard */}
            {gameState.showLeaderboard && gameState.teams && gameState.teams.length > 0 && (
                <aside className="scoreboard-sidebar">
                    <div className="scoreboard-glass">
                        <h3>LEADERBOARD</h3>
                        <div className="team-list">
                            {[...gameState.teams].sort((a: any, b: any) => b.score - a.score).map((t: any, i: number) => (
                                <div key={i} className={`team-row rank-${i+1} ${gameState.allInActive && t.allInUsed ? 'team-all-in' : ''}`}>
                                    <div className="team-rank">{i + 1}</div>
                                    <div className="team-name">
                                        {i === 0 && <span className="crown">👑</span>}
                                        {t.name}
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
                    <div className="winner-content">
                        <div className="trophy-icon">🏆</div>
                        <h1 className="winner-title">GRAND CHAMPIONS</h1>
                        {gameState.teams && gameState.teams.length > 0 && (
                            <div className="top-team">
                                <h2 className="top-team-name">
                                    {[...gameState.teams].sort((a: any, b: any) => b.score - a.score)[0]?.name}
                                </h2>
                                <div className="top-team-score">
                                    {[...gameState.teams].sort((a: any, b: any) => b.score - a.score)[0]?.score} POINTS
                                </div>
                            </div>
                        )}
                        
                        <div className="final-standings-list" style={{ marginTop: '3rem', background: 'rgba(255,255,255,0.05)', padding: '2rem', borderRadius: '2rem' }}>
                            <h3 style={{ opacity: 0.5, marginBottom: '2rem', letterSpacing: '2px' }}>FINAL STANDINGS</h3>
                            <div className="standings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
                                {[...gameState.teams].sort((a: any, b: any) => b.score - a.score).map((t: any, i: number) => (
                                    <div key={i} className="standing-item">
                                        <div className="standing-rank" style={{ fontSize: '1.2rem', opacity: 0.4 }}>#{i+1}</div>
                                        <div className="standing-name" style={{ fontSize: '1.8rem', fontWeight: 900 }}>{t.name}</div>
                                        <div className="standing-score" style={{ fontSize: '2.5rem', fontWeight: 900, color: '#00E5FF' }}>{t.score}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
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
                    font-family: var(--artist-font, 'Syncopate', sans-serif);
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
            `}</style>
        </div>
    );
};

export default Presentation;
