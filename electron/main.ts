import { app, BrowserWindow, ipcMain, shell, safeStorage, protocol, net } from 'electron';
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

// Register custom protocol for local assets
protocol.registerSchemesAsPrivileged([
    { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

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
        if (!fs.existsSync(configPath)) return { geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '', fanartPersonalApiKey: '', spotifyMobileMode: 'desktop' };
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        const decrypted = {
            geminiKey: '',
            geminiModel: data.geminiModel || '',
            spotifyClientId: '',
            spotifyClientSecret: '',
            fanartPersonalApiKey: '',
            spotifyMobileMode: data.spotifyMobileMode || 'desktop'
        };

        // Decrypt if available
        if (safeStorage.isEncryptionAvailable()) {
            decrypted.geminiKey = data.geminiKey ? safeStorage.decryptString(Buffer.from(data.geminiKey, 'base64')) : '';
            decrypted.spotifyClientId = data.spotifyClientId ? safeStorage.decryptString(Buffer.from(data.spotifyClientId, 'base64')) : '';
            decrypted.spotifyClientSecret = data.spotifyClientSecret ? safeStorage.decryptString(Buffer.from(data.spotifyClientSecret, 'base64')) : '';
            decrypted.fanartPersonalApiKey = data.fanartPersonalApiKey ? safeStorage.decryptString(Buffer.from(data.fanartPersonalApiKey, 'base64')) : '';
            return decrypted;
        }
        return { ...data, spotifyMobileMode: data.spotifyMobileMode || 'desktop' };
    } catch (e) {
        console.error('Failed to read config', e);
        return { geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '', fanartPersonalApiKey: '', spotifyMobileMode: 'desktop' };
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
                fanartPersonalApiKey: newConfig.fanartPersonalApiKey ? safeStorage.encryptString(newConfig.fanartPersonalApiKey).toString('base64') : '',
                spotifyMobileMode: newConfig.spotifyMobileMode || 'desktop'
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
    // Handle the custom asset:// protocol
    protocol.handle('asset', (request) => {
        const url = request.url.replace('asset://', '');
        // Assets are stored in the quizzes directory
        const filePath = path.join(quizzesDir, decodeURIComponent(url));
        return net.fetch('file://' + filePath);
    });

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
    const quizId = quiz.id;
    const assetsDir = path.join(quizzesDir, `quiz_${quizId}_assets`);
    
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Process quiz data to find base64 images and save them locally
    for (const artist of quiz.data) {
        // Handle Logo
        if (artist.fanart_logo && artist.fanart_logo.startsWith('data:image')) {
            const ext = artist.fanart_logo.split(';')[0].split('/')[1] || 'png';
            const fileName = `logo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
            const buffer = Buffer.from(artist.fanart_logo.split(',')[1], 'base64');
            fs.writeFileSync(path.join(assetsDir, fileName), buffer);
            artist.fanart_logo = `asset://quiz_${quizId}_assets/${fileName}`;
        }

        // Handle Backgrounds
        if (artist.fanart_backgrounds) {
            for (let i = 0; i < artist.fanart_backgrounds.length; i++) {
                const bg = artist.fanart_backgrounds[i];
                if (bg.startsWith('data:image')) {
                    const ext = bg.split(';')[0].split('/')[1] || 'png';
                    const fileName = `bg_${i}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
                    const buffer = Buffer.from(bg.split(',')[1], 'base64');
                    fs.writeFileSync(path.join(assetsDir, fileName), buffer);
                    artist.fanart_backgrounds[i] = `asset://quiz_${quizId}_assets/${fileName}`;
                }
            }
        }
    }

    const fileName = `quiz_${quizId}.json`;
    const filePath = path.join(quizzesDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(quiz, null, 2));
    return true;
});

// Fanart.tv API Handlers (Bypass CORS)
ipcMain.handle('fetch-mbid', async (event, artistName) => {
    try {
        const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'TheArtistUnlocked/1.0 ( https://github.com/janusklok/The-Artist-Unlocked )',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) return null;
        const data = await response.json();
        
        if (data && data.artists && data.artists.length > 0) {
            const exactMatch = data.artists.find((a: any) => a.name.toLowerCase() === artistName.toLowerCase());
            if (exactMatch) return exactMatch.id;
            return data.artists[0].id;
        }
        return null;
    } catch (e) {
        console.error('Failed to look up MBID', e);
        return null;
    }
});

ipcMain.handle('fetch-fanart', async (event, mbid, personalApiKey, quizId) => {
    try {
        const FANART_PROJECT_KEY = '5abfea3e4693ea492dedae876e5bc3da';
        const url = `https://webservice.fanart.tv/v3/music/${mbid}?api_key=${FANART_PROJECT_KEY}&client_key=${personalApiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) return null;
        const data = await response.json();
        
        const assets: { logoUrl?: string, backgroundUrls: string[] } = { backgroundUrls: [] };
        
        // Prepare local assets directory
        const assetsSubDir = `quiz_${quizId}_assets`;
        const assetsDir = path.join(quizzesDir, assetsSubDir);
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }

        const downloadImage = async (imgUrl: string, prefix: string) => {
            try {
                const res = await fetch(imgUrl);
                const buffer = await res.arrayBuffer();
                const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
                const fileName = `${prefix}_${Math.random().toString(36).substr(2, 5)}${ext}`;
                fs.writeFileSync(path.join(assetsDir, fileName), Buffer.from(buffer));
                return `asset://${assetsSubDir}/${fileName}`;
            } catch (e) {
                console.error(`Failed to download image ${imgUrl}`, e);
                return imgUrl; // Fallback to remote URL if download fails
            }
        };

        if (data.hdmusiclogo && data.hdmusiclogo.length > 0) {
            assets.logoUrl = await downloadImage(data.hdmusiclogo[0].url, 'logo');
        } else if (data.musiclogo && data.musiclogo.length > 0) {
            assets.logoUrl = await downloadImage(data.musiclogo[0].url, 'logo');
        }

        if (data.artistbackground && data.artistbackground.length > 0) {
            const bgs = data.artistbackground.slice(0, 5);
            for (let i = 0; i < bgs.length; i++) {
                const localUrl = await downloadImage(bgs[i].url, `bg_${i}`);
                assets.backgroundUrls.push(localUrl);
            }
        }

        return assets;
    } catch (e) {
        console.error('Failed to fetch Fanart images', e);
        return null;
    }
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
    const assetsDir = path.join(quizzesDir, `quiz_${quizId}_assets`);
    
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        
        // Also delete assets directory if it exists
        if (fs.existsSync(assetsDir)) {
            fs.rmSync(assetsDir, { recursive: true, force: true });
        }
        
        return true;
    }
    return false;
});

// Mode C Local Server Spin-up
let latestGameState: any = null;
let currentRemoteGuid: string = '';
let previousRemoteGuid: string = ''; // Grace period for rotation

ipcMain.handle('update-remote-guid', (event, guid) => {
    previousRemoteGuid = currentRemoteGuid;
    currentRemoteGuid = guid;
    console.log(`Remote GUID rotated. New: ${guid}, Prev: ${previousRemoteGuid}`);
    return true;
});

ipcMain.on('broadcast-state', (event, state) => {
    latestGameState = state;
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('state-updated', state);
        }
    });
    if (ioServer) {
        ioServer.emit('state-updated', state);
    }
});

ipcMain.handle('start-remote-server', async (event, initialGuid) => {
    currentRemoteGuid = initialGuid;
    if (ioServer) return getLocalIP();

    const expressApp = express();
    const server = createServer(expressApp);
    
    ioServer = new Server(server, { 
        cors: { origin: '*' },
        transports: ['polling', 'websocket'], // Allow both, polling is safer for initial handshake
        allowEIO3: true
    });

    // Use middleware for authentication
    ioServer.use((socket, next) => {
        const queryAuth = socket.handshake.query.auth;
        const providedAuth = Array.isArray(queryAuth) ? queryAuth[0] : queryAuth;
        
        // Allow current OR previous GUID to prevent disconnects during rotation
        if (providedAuth === currentRemoteGuid || (previousRemoteGuid && providedAuth === previousRemoteGuid)) {
            return next();
        }
        
        console.log(`Socket Auth Failed. Provided: ${providedAuth}, Expected: ${currentRemoteGuid}`);
        return next(new Error('AUTH_FAILED'));
    });

    // Serve the dedicated mobile quizmaster remote control page
    const mobilePath = path.join(__dirname, '../public/mobile-remote.html');
    expressApp.get('/', (req: any, res: any) => {
        const urlGuid = req.query.auth;
        
        if (urlGuid !== currentRemoteGuid && urlGuid !== previousRemoteGuid) {
            return res.status(403).send(`
                <body style="background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;padding:2rem;">
                    <div>
                        <h1 style="color:#ff4444;">⚠️ Access Denied</h1>
                        <p>The session key has expired or is invalid.</p>
                        <p>Please scan the <b>new</b> QR code on the Dashboard.</p>
                    </div>
                </body>
            `);
        }

        if (fs.existsSync(mobilePath)) {
            res.type('html').send(fs.readFileSync(mobilePath, 'utf8'));
        } else {
            res.status(404).send('Mobile remote page not found.');
        }
    });

    server.listen(3001, '0.0.0.0', () => { // Bind to all interfaces explicitly
        console.log('Mobile remote server running on port 3001');
    });

    ioServer.on('connection', (socket) => {
        console.log(`Mobile Remote Connected: ${socket.id}`);

        // Send current state immediately
        if (latestGameState) {
            console.log(`Sending initial state to ${socket.id}`);
            socket.emit('state-updated', latestGameState);
        }

        socket.on('request-state', () => {
            console.log(`State requested by ${socket.id}`);
            if (latestGameState) {
                socket.emit('state-updated', latestGameState);
            }
        });

        socket.on('broadcast-state', (state) => {
            latestGameState = state;
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                    win.webContents.send('state-updated', state);
                }
            });
            ioServer!.emit('state-updated', state);
        });

        socket.on('spotify-trigger', (uri: string) => {
            shell.openExternal(uri);
        });

        socket.on('disconnect', (reason) => {
            console.log(`Mobile Remote Disconnected (${socket.id}): ${reason}`);
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
