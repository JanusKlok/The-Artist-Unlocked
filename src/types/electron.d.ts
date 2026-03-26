import type { QuizArtist } from '../services/gemini';
import type { GameState } from '../utils/gameLogic';

export interface AppConfig {
    geminiKey: string;
    geminiModel: string;
    spotifyClientId: string;
    spotifyClientSecret: string;
    fanartPersonalApiKey: string;
    spotifyMobileMode: string;
    openaiKey: string;
    openaiModel: string;
    anthropicKey: string;
    anthropicModel: string;
    groqKey: string;
    groqModel: string;
    mistralKey: string;
    mistralModel: string;
    defaultAiProvider: string;
}

export interface FanartAssets {
    logoUrl?: string;
    backgroundUrls: string[];
}

export interface SavedQuiz {
    id: number;
    name: string;
    data: QuizArtist[];
}

export interface ElectronAPI {
    openSpotify: (uri: string) => Promise<void>;
    getConfig: () => Promise<AppConfig>;
    setConfig: (config: AppConfig) => Promise<boolean>;
    broadcastState: (state: GameState) => void;
    onStateUpdate: (callback: (state: GameState) => void) => void;
    startRemoteServer: (initialGuid: string) => Promise<string>;
    updateRemoteGuid: (guid: string) => Promise<boolean>;
    openPresentationWindow: () => Promise<void>;
    saveQuiz: (quiz: SavedQuiz) => Promise<boolean>;
    getQuizzes: () => Promise<SavedQuiz[]>;
    deleteQuiz: (quizId: number) => Promise<boolean>;
    fetchMbid: (artistName: string) => Promise<string | null>;
    fetchFanart: (mbid: string, quizId: number) => Promise<FanartAssets | null>;
    listProviderModels: (provider: string, apiKey?: string) => Promise<string[]>;
    generateTrivia: (provider: string, model: string, prompt: string) => Promise<string>;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
