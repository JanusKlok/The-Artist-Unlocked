import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import Setup from './views/Setup';
import Builder from './views/Builder';
import Dashboard from './views/Dashboard';
import Presentation from './views/Presentation';

// @ts-ignore
const getApi = () => window.electronAPI || { 
    getConfig: async () => ({ geminiKey: '', spotifyClientId: '' }),
    getQuizzes: async () => [],
};

const MainLayout: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'config' | 'builder' | 'dashboard'>('config');
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const init = async () => {
            const config = await getApi().getConfig();
            const quizzes = await getApi().getQuizzes();

            const isConfigComplete = config.geminiKey && config.geminiModel && config.spotifyClientId && config.spotifyClientSecret;
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
                    🔐 Config
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('builder')}
                >
                    🎨 Quiz Builder
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('dashboard')}
                >
                    🎮 Dashboard
                </button>
            </nav>

            <main className="tab-content">
                <div style={{ display: activeTab === 'config' ? 'block' : 'none' }}>
                    <Setup />
                </div>
                <div style={{ display: activeTab === 'builder' ? 'block' : 'none' }}>
                    <Builder />
                </div>
                <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
                    <Dashboard />
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
                    gap: 0.5rem;
                    z-index: 100;
                }
                .tab-btn {
                    background: transparent;
                    border: none;
                    box-shadow: none;
                    padding: 0.75rem 1.5rem;
                    color: #888;
                    font-weight: 600;
                    cursor: pointer;
                    border-radius: 8px 8px 0 0;
                    transition: all 0.2s;
                    border-bottom: 3px solid transparent;
                }
                .tab-btn:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.05);
                }
                .tab-btn.active {
                    color: var(--primary);
                    background: rgba(255, 255, 255, 0.1);
                    border-bottom: 3px solid var(--primary);
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
            `}</style>
        </div>
    );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainLayout />} />
        <Route path="/presentation" element={<Presentation />} />
      </Routes>
    </Router>
  );
}

export default App;
