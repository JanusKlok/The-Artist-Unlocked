import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import Setup from './views/Setup';
import Builder from './views/Builder';
import Dashboard from './views/Dashboard';
import Presentation from './views/Presentation';
import ErrorBoundary from './components/ErrorBoundary';

const getApi = () => window.electronAPI || {
    getConfig: async () => ({
        geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '',
        fanartPersonalApiKey: '', spotifyMobileMode: 'desktop',
        openaiKey: '', openaiModel: '', anthropicKey: '', anthropicModel: '',
        groqKey: '', groqModel: '', mistralKey: '', mistralModel: '', defaultAiProvider: 'gemini'
    }),
    getQuizzes: async () => [],
};

const MainLayout: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'config' | 'builder' | 'dashboard'>('config');
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const init = async () => {
            const config = await getApi().getConfig();
            const quizzes = await getApi().getQuizzes();

            const defaultProvider = config.defaultAiProvider || 'gemini';
            const cfg = config as unknown as Record<string, string>;
            const isConfigComplete =
                cfg[`${defaultProvider}Key`] &&
                cfg[`${defaultProvider}Model`] &&
                config.spotifyClientId &&
                config.spotifyClientSecret;
            const hasQuizzes = quizzes && quizzes.length > 0;

            if (!isConfigComplete) {
                setActiveTab('config');
            } else if (hasQuizzes) {
                setActiveTab('dashboard');
            } else {
                setActiveTab('builder');
            }
            setIsLoaded(true);
        };
        init();
    }, []);

    if (!isLoaded) return <div className="loader-container"><div className="loader"></div></div>;

    return (
        <div className="app-container">
            <nav className="tab-bar">
                <button
                    className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
                    onClick={() => setActiveTab('config')}
                >
                    <span className="tab-icon">🔐</span>
                    <span className="tab-label">Config</span>
                </button>
                <button
                    className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
                    onClick={() => setActiveTab('builder')}
                >
                    <span className="tab-icon">🎨</span>
                    <span className="tab-label">Quiz Builder</span>
                </button>
                <button
                    className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dashboard')}
                >
                    <span className="tab-icon">🎮</span>
                    <span className="tab-label">Dashboard</span>
                </button>
            </nav>

            <main className="tab-content">
                <div style={{ display: activeTab === 'config' ? 'block' : 'none' }}>
                    <Setup />
                </div>
                <div style={{ display: activeTab === 'builder' ? 'block' : 'none' }}>
                    <Builder isActive={activeTab === 'builder'} />
                </div>
                <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
                    <Dashboard isActive={activeTab === 'dashboard'} />
                </div>
            </main>

            <style>{`
                .app-container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    overflow: hidden;
                }
                .tab-bar {
                    display: flex;
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(10px);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    padding: 0.5rem 1rem 0 1rem;
                    gap: 0.25rem;
                    z-index: 100;
                }
                .tab-btn {
                    background: transparent;
                    border: none;
                    box-shadow: none;
                    padding: 0.75rem 1.25rem;
                    color: #aaa;
                    font-weight: 600;
                    cursor: pointer;
                    border-radius: 8px 8px 0 0;
                    transition: all 0.2s;
                    border-bottom: 3px solid transparent;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    white-space: nowrap;
                    font-size: 0.95rem;
                }
                .tab-btn:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.06);
                }
                .tab-btn.active {
                    color: var(--primary);
                    background: rgba(var(--primary), 0.08);
                    background: rgba(255, 64, 129, 0.08);
                    border-bottom: 3px solid var(--primary);
                }
                .tab-icon {
                    font-size: 1.1rem;
                    line-height: 1;
                }
                .tab-label {
                    font-size: inherit;
                }
                .tab-content {
                    flex: 1;
                    overflow-y: auto;
                    padding-bottom: 2rem;
                }
                .loader-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                @media (max-width: 500px) {
                    .tab-bar {
                        justify-content: center;
                        padding: 0.5rem 0.5rem 0;
                    }
                    .tab-btn {
                        flex: 1;
                        justify-content: center;
                        padding: 0.6rem 0.5rem;
                        flex-direction: column;
                        gap: 0.15rem;
                    }
                    .tab-icon {
                        font-size: 1.3rem;
                    }
                    .tab-label {
                        font-size: 0.65rem;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                }
            `}</style>
        </div>
    );
};

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<MainLayout />} />
          <Route path="/presentation" element={<Presentation />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
