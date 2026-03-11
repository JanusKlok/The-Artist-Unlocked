import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    openSpotify: (uri: string) => ipcRenderer.invoke('open-spotify', uri),
    getConfig: () => ipcRenderer.invoke('get-config'),
    setConfig: (config: any) => ipcRenderer.invoke('set-config', config),
    broadcastState: (state: any) => ipcRenderer.send('broadcast-state', state),
    onStateUpdate: (callback: (state: any) => void) => {
        ipcRenderer.on('state-updated', (_event, state) => callback(state));
    },
    startRemoteServer: () => ipcRenderer.invoke('start-remote-server'),
    openPresentationWindow: () => ipcRenderer.invoke('open-presentation-window'),
    saveQuiz: (quiz: any) => ipcRenderer.invoke('save-quiz', quiz),
    getQuizzes: () => ipcRenderer.invoke('get-quizzes'),
    deleteQuiz: (quizId: any) => ipcRenderer.invoke('delete-quiz', quizId),
});
