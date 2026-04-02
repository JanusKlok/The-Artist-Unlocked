import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig, SavedQuiz } from '../src/types/electron';
import type { GameState } from '../src/utils/gameLogic';

contextBridge.exposeInMainWorld('electronAPI', {
    openSpotify: (uri: string) => ipcRenderer.invoke('open-spotify', uri),
    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (config: AppConfig) => ipcRenderer.invoke('set-config', config),
    broadcastState: (state: GameState) => ipcRenderer.send('broadcast-state', state),
    onStateUpdate: (callback: (state: GameState) => void) => {
        ipcRenderer.on('state-updated', (_event, state) => callback(state));
    },
    onMobileConnected: (callback: () => void) => {
        ipcRenderer.on('mobile-connected', () => callback());
    },
    startRemoteServer: (initialGuid: string) => ipcRenderer.invoke('start-remote-server', initialGuid),
    updateRemoteGuid: (guid: string) => ipcRenderer.invoke('update-remote-guid', guid),
    openPresentationWindow: () => ipcRenderer.invoke('open-presentation-window'),
    saveQuiz: (quiz: SavedQuiz) => ipcRenderer.invoke('save-quiz', quiz),
    getQuizzes: () => ipcRenderer.invoke('get-quizzes'),
    deleteQuiz: (quizId: number) => ipcRenderer.invoke('delete-quiz', quizId),
    fetchMbid: (artistName: string) => ipcRenderer.invoke('fetch-mbid', artistName),
    fetchFanart: (mbid: string, quizId: number) => ipcRenderer.invoke('fetch-fanart', mbid, quizId),
    listProviderModels: (provider: string, apiKey?: string) => ipcRenderer.invoke('list-provider-models', provider, apiKey),
    generateTrivia: (provider: string, model: string, prompt: string) => ipcRenderer.invoke('generate-trivia', provider, model, prompt),
    generatePlayerGuid: () => ipcRenderer.invoke('generate-player-guid'),
    getPlayerTeams: () => ipcRenderer.invoke('get-player-teams'),
    generateRejoinQr: (teamName: string) => ipcRenderer.invoke('generate-rejoin-qr', teamName),
    removePlayerTeam: (teamName: string) => ipcRenderer.invoke('remove-player-team', teamName),
    onPlayerAnswersUpdated: (callback: (data: unknown) => void) => {
        ipcRenderer.on('player-answers-updated', (_event, data) => callback(data));
    },
    onPlayerTeamJoined: (callback: (data: { teamName: string }) => void) => {
        ipcRenderer.on('player-team-joined', (_event, data) => callback(data));
    },
    onTeamLockinStatus: (callback: (status: Record<string, boolean>) => void) => {
        ipcRenderer.on('team-lockin-status', (_event, status) => callback(status));
    },
});
