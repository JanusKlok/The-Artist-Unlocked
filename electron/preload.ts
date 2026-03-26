import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    openSpotify: (uri: string) => ipcRenderer.invoke('open-spotify', uri),
    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (config: any) => ipcRenderer.invoke('set-config', config),
    broadcastState: (state: any) => ipcRenderer.send('broadcast-state', state),
    onStateUpdate: (callback: (state: any) => void) => {
        ipcRenderer.on('state-updated', (_event, state) => callback(state));
    },
    startRemoteServer: (initialGuid: string) => ipcRenderer.invoke('start-remote-server', initialGuid),
    updateRemoteGuid: (guid: string) => ipcRenderer.invoke('update-remote-guid', guid),
    openPresentationWindow: () => ipcRenderer.invoke('open-presentation-window'),
    saveQuiz: (quiz: any) => ipcRenderer.invoke('save-quiz', quiz),
    getQuizzes: () => ipcRenderer.invoke('get-quizzes'),
    deleteQuiz: (quizId: any) => ipcRenderer.invoke('delete-quiz', quizId),
    fetchMbid: (artistName: string) => ipcRenderer.invoke('fetch-mbid', artistName),
    fetchFanart: (mbid: string, quizId: number) => ipcRenderer.invoke('fetch-fanart', mbid, quizId),
    listProviderModels: (provider: string, apiKey?: string) => ipcRenderer.invoke('list-provider-models', provider, apiKey),
    generateTrivia: (provider: string, model: string, prompt: string) => ipcRenderer.invoke('generate-trivia', provider, model, prompt),
});
