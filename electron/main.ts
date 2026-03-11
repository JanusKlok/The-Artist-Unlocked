import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Provide a default path for __dirname in ESM or commonjs if needed
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Polyfill global __dirname/__filename for ESM — required by Express/Socket.io internals (e.g. `send` package)
// @ts-ignore
globalThis.__dirname = __dirname;
// @ts-ignore
globalThis.__filename = __filename;

let mainWindow: BrowserWindow | null = null;
let presentationWindow: BrowserWindow | null = null;
let ioServer: Server | null = null;
const configPath = path.join(app.getPath('userData'), 'config.json');
const quizzesDir = path.join(app.getPath('userData'), 'quizzes');

if (!fs.existsSync(quizzesDir)) {
    fs.mkdirSync(quizzesDir, { recursive: true });
}

/**
 * Retrieves the local IPv4 address of the machine.
 * Used for the mobile remote control server connection.
 */
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]!) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'localhost';
}

/**
 * Loads the application configuration from the local user data directory.
 * Decrypts sensitive keys using Electron's safeStorage API.
 */
function getConfig() {
    try {
        if (!fs.existsSync(configPath)) return { geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '' };
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Decrypt if available
        if (safeStorage.isEncryptionAvailable()) {
            return {
                geminiKey: data.geminiKey ? safeStorage.decryptString(Buffer.from(data.geminiKey, 'base64')) : '',
                geminiModel: data.geminiModel || '',
                spotifyClientId: data.spotifyClientId ? safeStorage.decryptString(Buffer.from(data.spotifyClientId, 'base64')) : '',
                spotifyClientSecret: data.spotifyClientSecret ? safeStorage.decryptString(Buffer.from(data.spotifyClientSecret, 'base64')) : '',
            };
        }
        return data;
    } catch (e) {
        console.error('Failed to read config', e);
        return { geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '' };
    }
}

/**
 * Saves the application configuration to the local user data directory.
 * Encrypts sensitive keys using Electron's safeStorage API.
 */
function setConfig(newConfig: any) {
    try {
        let dataToSave = { ...newConfig };
        if (safeStorage.isEncryptionAvailable()) {
            dataToSave = {
                geminiKey: newConfig.geminiKey ? safeStorage.encryptString(newConfig.geminiKey).toString('base64') : '',
                geminiModel: newConfig.geminiModel || '',
                spotifyClientId: newConfig.spotifyClientId ? safeStorage.encryptString(newConfig.spotifyClientId).toString('base64') : '',
                spotifyClientSecret: newConfig.spotifyClientSecret ? safeStorage.encryptString(newConfig.spotifyClientSecret).toString('base64') : '',
            };
        }
        fs.writeFileSync(configPath, JSON.stringify(dataToSave, null, 2));
        return true;
    } catch (e) {
        console.error('Failed to save config', e);
        return false;
    }
}

/**
 * Creates the main application window (Quizmaster Dashboard).
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../public/music.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Setup IPC handlers
ipcMain.handle('open-spotify', async (event, uri: string) => {
    await shell.openExternal(uri);
});

ipcMain.handle('get-config', () => getConfig());
ipcMain.handle('set-config', (event, newConfig) => setConfig(newConfig));

ipcMain.handle('save-quiz', async (event, quiz) => {
    const fileName = `quiz_${quiz.id}.json`;
    const filePath = path.join(quizzesDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(quiz, null, 2));
    return true;
});

ipcMain.handle('get-quizzes', async () => {
    const files = fs.readdirSync(quizzesDir);
    const quizzes = files
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(quizzesDir, f), 'utf8')));
    return quizzes;
});

ipcMain.handle('delete-quiz', async (event, quizId) => {
    const filePath = path.join(quizzesDir, `quiz_${quizId}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
    }
    return false;
});

// Mode C Local Server Spin-up
let latestGameState: any = null;

ipcMain.on('broadcast-state', (event, state) => {
    latestGameState = state;
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('state-updated', state);
    });
    if (ioServer) {
        ioServer.emit('state-updated', state);
    }
});

ipcMain.handle('start-remote-server', async () => {
    if (ioServer) return getLocalIP();

    const expressApp = express();
    const server = createServer(expressApp);
    ioServer = new Server(server, { cors: { origin: '*' } });

    // Serve the dedicated mobile quizmaster remote control page
    const mobilePath = path.join(__dirname, '../public/mobile-remote.html');
    expressApp.get('/', (req: any, res: any) => {
        if (fs.existsSync(mobilePath)) {
            res.type('html').send(fs.readFileSync(mobilePath, 'utf8'));
        } else {
            res.status(404).send('Mobile remote page not found.');
        }
    });

    server.listen(3001, () => {
        console.log('Mobile remote server running on port 3001');
    });

    ioServer.on('connection', (socket) => {
        // Send current state to newly connected mobile devices
        if (latestGameState) {
            socket.emit('state-updated', latestGameState);
        }

        // Mobile can explicitly request current state after page fully loads
        socket.on('request-state', () => {
            if (latestGameState) {
                socket.emit('state-updated', latestGameState);
            }
        });

        socket.on('broadcast-state', (state) => {
            latestGameState = state;
            BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('state-updated', state);
            });
            // Emit to ALL sockets (including sender) so the mobile updates its own UI
            ioServer!.emit('state-updated', state);
        });

        socket.on('spotify-trigger', (uri: string) => {
            shell.openExternal(uri);
        });
    });

    return getLocalIP();
});

ipcMain.handle('open-presentation-window', () => {
    if (presentationWindow) {
        presentationWindow.focus();
        return;
    }

    presentationWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        autoHideMenuBar: true, // Clean edge but still resizable and draggable
        icon: path.join(__dirname, '../public/music.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        presentationWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '#/presentation');
    } else {
        presentationWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'presentation' });
    }

    // Push current game state to the newly opened presentation window
    presentationWindow.webContents.on('did-finish-load', () => {
        if (latestGameState) {
            presentationWindow?.webContents.send('state-updated', latestGameState);
        }
    });

    presentationWindow.on('closed', () => {
        presentationWindow = null;
    });
});
