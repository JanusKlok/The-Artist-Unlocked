import { app, BrowserWindow, ipcMain, shell, safeStorage, protocol, net } from 'electron';
import { listProviderModels, fetchTriviaCompletion } from './aiProviders.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { Server, type Namespace } from 'socket.io';
import crypto from 'crypto';
import type { GameState, TeamAnswer, PlayerTeamRecord, PlayerViewState, QuizmasterAnswerData } from '../src/utils/gameLogic';

// Provide a default path for __dirname in ESM or commonjs if needed
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Polyfill global __dirname/__filename for ESM — required by Express/Socket.io internals (e.g. `send` package)
// @ts-expect-error - globalThis does not declare __dirname in ESM context
globalThis.__dirname = __dirname;
// @ts-expect-error - globalThis does not declare __filename in ESM context
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
        if (!fs.existsSync(configPath)) return {
            geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '',
            fanartPersonalApiKey: '', spotifyMobileMode: 'desktop',
            openaiKey: '', openaiModel: '', anthropicKey: '', anthropicModel: '',
            groqKey: '', groqModel: '', mistralKey: '', mistralModel: '', defaultAiProvider: 'gemini'
        };
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        const decrypted = {
            geminiKey: '',
            geminiModel: data.geminiModel || '',
            spotifyClientId: '',
            spotifyClientSecret: '',
            fanartPersonalApiKey: '',
            spotifyMobileMode: data.spotifyMobileMode || 'desktop',
            openaiKey: '',
            openaiModel: data.openaiModel || '',
            anthropicKey: '',
            anthropicModel: data.anthropicModel || '',
            groqKey: '',
            groqModel: data.groqModel || '',
            mistralKey: '',
            mistralModel: data.mistralModel || '',
            defaultAiProvider: data.defaultAiProvider || 'gemini'
        };

        // Decrypt if available
        if (safeStorage.isEncryptionAvailable()) {
            decrypted.geminiKey = data.geminiKey ? safeStorage.decryptString(Buffer.from(data.geminiKey, 'base64')) : '';
            decrypted.spotifyClientId = data.spotifyClientId ? safeStorage.decryptString(Buffer.from(data.spotifyClientId, 'base64')) : '';
            decrypted.spotifyClientSecret = data.spotifyClientSecret ? safeStorage.decryptString(Buffer.from(data.spotifyClientSecret, 'base64')) : '';
            decrypted.fanartPersonalApiKey = data.fanartPersonalApiKey ? safeStorage.decryptString(Buffer.from(data.fanartPersonalApiKey, 'base64')) : '';
            decrypted.openaiKey = data.openaiKey ? safeStorage.decryptString(Buffer.from(data.openaiKey, 'base64')) : '';
            decrypted.anthropicKey = data.anthropicKey ? safeStorage.decryptString(Buffer.from(data.anthropicKey, 'base64')) : '';
            decrypted.groqKey = data.groqKey ? safeStorage.decryptString(Buffer.from(data.groqKey, 'base64')) : '';
            decrypted.mistralKey = data.mistralKey ? safeStorage.decryptString(Buffer.from(data.mistralKey, 'base64')) : '';
            return decrypted;
        }
        return {
            ...data,
            spotifyMobileMode: data.spotifyMobileMode || 'desktop',
            openaiKey: data.openaiKey || '', openaiModel: data.openaiModel || '',
            anthropicKey: data.anthropicKey || '', anthropicModel: data.anthropicModel || '',
            groqKey: data.groqKey || '', groqModel: data.groqModel || '',
            mistralKey: data.mistralKey || '', mistralModel: data.mistralModel || '',
            defaultAiProvider: data.defaultAiProvider || 'gemini'
        };
    } catch (e) {
        console.error('Failed to read config', e);
        return {
            geminiKey: '', geminiModel: '', spotifyClientId: '', spotifyClientSecret: '',
            fanartPersonalApiKey: '', spotifyMobileMode: 'desktop',
            openaiKey: '', openaiModel: '', anthropicKey: '', anthropicModel: '',
            groqKey: '', groqModel: '', mistralKey: '', mistralModel: '', defaultAiProvider: 'gemini'
        };
    }
}

/**
 * Saves the application configuration to the local user data directory.
 * Encrypts sensitive keys using Electron's safeStorage API.
 */
interface ConfigData {
    geminiKey?: string; geminiModel?: string;
    spotifyClientId?: string; spotifyClientSecret?: string; spotifyMobileMode?: string;
    fanartPersonalApiKey?: string;
    openaiKey?: string; openaiModel?: string;
    anthropicKey?: string; anthropicModel?: string;
    groqKey?: string; groqModel?: string;
    mistralKey?: string; mistralModel?: string;
    defaultAiProvider?: string;
}

function setConfig(newConfig: ConfigData) {
    try {
        let dataToSave = { ...newConfig };
        if (safeStorage.isEncryptionAvailable()) {
            const enc = (val: string) => val ? safeStorage.encryptString(val).toString('base64') : '';
            dataToSave = {
                geminiKey: enc(newConfig.geminiKey),
                geminiModel: newConfig.geminiModel || '',
                spotifyClientId: enc(newConfig.spotifyClientId),
                spotifyClientSecret: enc(newConfig.spotifyClientSecret),
                fanartPersonalApiKey: enc(newConfig.fanartPersonalApiKey),
                spotifyMobileMode: newConfig.spotifyMobileMode || 'desktop',
                openaiKey: enc(newConfig.openaiKey),
                openaiModel: newConfig.openaiModel || '',
                anthropicKey: enc(newConfig.anthropicKey),
                anthropicModel: newConfig.anthropicModel || '',
                groqKey: enc(newConfig.groqKey),
                groqModel: newConfig.groqModel || '',
                mistralKey: enc(newConfig.mistralKey),
                mistralModel: newConfig.mistralModel || '',
                defaultAiProvider: newConfig.defaultAiProvider || 'gemini'
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
        const filePath = path.join(quizzesDir, decodeURIComponent(url));
        // Prevent path traversal attacks
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(path.resolve(quizzesDir))) {
            return new Response('Forbidden', { status: 403 });
        }
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
            const exactMatch = data.artists.find((a: { name: string; id: string }) => a.name.toLowerCase() === artistName.toLowerCase());
            if (exactMatch) return exactMatch.id;
            return data.artists[0].id;
        }
        return null;
    } catch (e) {
        console.error('Failed to look up MBID', e);
        return null;
    }
});

ipcMain.handle('fetch-fanart', async (event, mbid, quizId) => {
    try {
        const personalApiKey = getConfig().fanartPersonalApiKey;
        if (!personalApiKey) return null;
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
let latestGameState: unknown = null;
let cachedQuizData: unknown[] = [];
let currentRemoteGuid: string = '';
const approvedSessionTokens = new Set<string>();

// === Player multiplayer state ===

/** All team answers for the current question, keyed by team name */
const playerAnswers = new Map<string, TeamAnswer>();

/** Connected player sessions, keyed by socket ID */
const playerSessions = new Map<string, {
    teamName: string;
    sessionToken: string;
}>();

/** All registered player teams, keyed by team name (lowercase for uniqueness) */
const playerTeams = new Map<string, PlayerTeamRecord>();

/** GUID for the player QR code (separate from quizmaster remoteGuid) */
let currentPlayerGuid = '';

/** Approved player session tokens */
const approvedPlayerSessionTokens = new Set<string>();

/** One-time rejoin tokens, keyed by token string -> team name */
const rejoinTokens = new Map<string, string>();

/** Reference to the /player Socket.IO namespace */
let playerNamespace: Namespace | null = null;

/**
 * Determine what phase a player should see based on current game state.
 */
function getPlayerPhase(gs: GameState): string {
    if (!gs.quizData || gs.quizData.length === 0) return 'lobby';
    if (gs.lobbyMode) return 'lobby';
    if (gs.winnerMode) return 'gameover';

    const isFinalQuestion =
        gs.activeArtistIndex === gs.quizData.length - 1 && gs.activeTier === 5;
    if (isFinalQuestion && !gs.wagersLocked && !gs.showAnswer) return 'wager';

    if (!gs.showAnswer) return 'answering';
    return 'waiting';
}

/**
 * Build the PlayerViewState for a specific team.
 * This is what gets sent to that team's phone — contains only their own answer data.
 */
function buildPlayerViewState(gs: GameState, teamName: string): PlayerViewState {
    const phase = getPlayerPhase(gs);
    const team = gs.teams.find(t => t.name === teamName);
    const sortedTeams = [...gs.teams].sort((a, b) => b.score - a.score);
    const rank = sortedTeams.findIndex(t => t.name === teamName) + 1;
    const isFinalQuestion = gs.quizData.length > 0 &&
        gs.activeArtistIndex === gs.quizData.length - 1 && gs.activeTier === 5;

    const answer = playerAnswers.get(teamName);

    return {
        phase: phase as PlayerViewState['phase'],
        teamName,
        teamScore: team?.score ?? 0,
        allInUsed: team?.allInUsed ?? false,
        allInAvailable: !(team?.allInUsed) && !isFinalQuestion,
        artistIndex: gs.activeArtistIndex,
        tier: gs.activeTier,
        totalArtists: gs.quizData.length,
        maxWager: team?.score ?? 0,
        currentWager: team?.wager ?? null,
        wagersLocked: gs.wagersLocked,
        currentAnswer: answer?.answer ?? '',
        currentLockedIn: answer?.lockedIn ?? false,
        timerEndTime: gs.timerEndTime,
        leaderboard: sortedTeams.map(t => ({ name: t.name, score: t.score })),
        isWinner: rank === 1 && gs.winnerMode,
        rank,
    };
}

/**
 * Send answer data to all quizmaster clients (Dashboard windows + quizmaster mobile remotes).
 * Also sends lock-in status to all windows (for Presentation lock-in indicators).
 */
function broadcastAnswersToQuizmasters(): void {
    const answers = Array.from(playerAnswers.values());
    const data: QuizmasterAnswerData = { answers };

    // Build lock-in status map for Presentation
    const lockInStatus: Record<string, boolean> = {};
    for (const [teamName, answer] of playerAnswers) {
        lockInStatus[teamName] = answer.lockedIn;
    }

    // Send to all Electron windows
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('player-answers-updated', data);
            win.webContents.send('team-lockin-status', lockInStatus);
        }
    });

    // Send answers to quizmaster mobile remotes (default namespace only — NOT /player)
    if (ioServer) {
        ioServer.emit('player-answers-updated', data);
    }
}

/**
 * Send updated PlayerViewState to every connected player.
 * Each player gets their own personalized view (with only their own answer data).
 */
function broadcastToAllPlayers(): void {
    if (!playerNamespace || !latestGameState) return;
    const gs = latestGameState as GameState;

    for (const [socketId, session] of playerSessions) {
        const socket = playerNamespace.sockets.get(socketId);
        if (socket) {
            socket.emit('player-view-update', buildPlayerViewState(gs, session.teamName));
        }
    }
}

/**
 * Clear all answers when the question changes (new artist or new tier).
 */
function clearAnswersForNewQuestion(): void {
    playerAnswers.clear();
    broadcastAnswersToQuizmasters();
    broadcastToAllPlayers();
}

ipcMain.handle('update-remote-guid', (event, guid) => {
    currentRemoteGuid = guid;
    approvedSessionTokens.clear();
    if (ioServer) {
        ioServer.disconnectSockets(true);
    }
    console.log(`Remote GUID regenerated: ${guid}. All existing sessions revoked.`);
    return true;
});

ipcMain.on('broadcast-state', (event, state) => {
    const prevState = latestGameState as GameState | null;

    // Cache quizData separately; only include in full state for new connections
    if (state.quizData) {
        cachedQuizData = state.quizData;
    }
    // Full state always available for new connections
    latestGameState = state.quizData ? state : { ...state, quizData: cachedQuizData };

    // Detect question change and clear answers
    if (prevState && (
        state.activeArtistIndex !== prevState.activeArtistIndex ||
        state.activeTier !== prevState.activeTier
    )) {
        clearAnswersForNewQuestion();
    }

    // Forward the (possibly lightweight) state to all windows and sockets
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send('state-updated', state);
        }
    });
    if (ioServer) {
        ioServer.emit('state-updated', state);
    }

    // Also update all player clients
    broadcastToAllPlayers();
});

ipcMain.handle('generate-player-guid', () => {
    currentPlayerGuid = crypto.randomBytes(16).toString('hex');
    approvedPlayerSessionTokens.clear();
    if (playerNamespace) {
        playerNamespace.disconnectSockets(true);
    }
    playerSessions.clear();
    // Don't clear playerTeams — they persist for rejoin
    return currentPlayerGuid;
});

ipcMain.handle('get-player-teams', () => {
    return Array.from(playerTeams.values()).map(t => ({
        teamName: t.teamName,
        connected: t.socketId !== null,
    }));
});

ipcMain.handle('generate-rejoin-qr', async (_event, teamName: string) => {
    const rejoinToken = crypto.randomBytes(32).toString('hex');
    rejoinTokens.set(rejoinToken, teamName);

    // Auto-expire after 5 minutes
    setTimeout(() => rejoinTokens.delete(rejoinToken), 5 * 60 * 1000);

    const localIP = getLocalIP();
    const url = `http://${localIP}:3001/play?rejoin=${rejoinToken}`;

    return { teamName, rejoinToken, url };
});

ipcMain.handle('remove-player-team', (_event, teamName: string) => {
    const lowerName = teamName.toLowerCase();
    const team = playerTeams.get(lowerName);
    if (team && team.socketId && playerNamespace) {
        const socket = playerNamespace.sockets.get(team.socketId);
        if (socket) {
            socket.emit('kicked');
            socket.disconnect(true);
        }
    }
    playerTeams.delete(lowerName);
    playerSessions.forEach((session, sid) => {
        if (session.teamName === teamName) playerSessions.delete(sid);
    });
    playerAnswers.delete(teamName);
    broadcastAnswersToQuizmasters();
    return true;
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
        const sessionToken = socket.handshake.query.session;
        const providedSession = Array.isArray(sessionToken) ? sessionToken[0] : sessionToken;

        // Allow if the client has a previously approved session token
        if (providedSession && approvedSessionTokens.has(providedSession)) {
            return next();
        }

        // Allow if the client provides the current GUID (first-time auth)
        if (providedAuth === currentRemoteGuid) {
            return next();
        }

        console.log(`Socket Auth Failed. Provided: ${providedAuth}, Expected: ${currentRemoteGuid}`);
        return next(new Error('AUTH_FAILED'));
    });

    // Issue a persistent session token for approved clients
    expressApp.get('/api/session', (req: Request, res: Response) => {
        const urlGuid = req.query.auth;
        if (urlGuid !== currentRemoteGuid) {
            return res.status(403).json({ error: 'Invalid auth' });
        }
        const sessionToken = crypto.randomBytes(32).toString('hex');
        approvedSessionTokens.add(sessionToken);
        res.json({ sessionToken });
    });

    // Serve the dedicated mobile quizmaster remote control page (cached in memory)
    const mobilePath = path.join(__dirname, '../public/mobile-remote.html');
    let mobileHtmlCache: string | null = null;
    expressApp.get('/', (req: Request, res: Response) => {
        const urlGuid = req.query.auth;
        const sessionToken = req.query.session;

        // Allow access with current GUID or an approved session token
        const authorized = urlGuid === currentRemoteGuid ||
            (typeof sessionToken === 'string' && approvedSessionTokens.has(sessionToken));

        if (!authorized) {
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

        if (!mobileHtmlCache) {
            if (fs.existsSync(mobilePath)) {
                mobileHtmlCache = fs.readFileSync(mobilePath, 'utf8');
            } else {
                return res.status(404).send('Mobile remote page not found.');
            }
        }
        res.type('html').send(mobileHtmlCache);
    });

    // Serve player mobile page
    let playerHtmlCache: string | null = null;
    expressApp.get('/play', (req: Request, res: Response) => {
        const urlGuid = req.query.auth;
        const sessionToken = req.query.session;
        const rejoinToken = req.query.rejoin;

        const authorized =
            urlGuid === currentPlayerGuid ||
            (typeof sessionToken === 'string' && approvedPlayerSessionTokens.has(sessionToken)) ||
            (typeof rejoinToken === 'string' && rejoinTokens.has(rejoinToken));

        if (!authorized) {
            return res.status(403).send(`
                <body style="background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;padding:2rem;">
                    <div>
                        <h1 style="color:#ff4444;">Access Denied</h1>
                        <p>This link has expired. Please scan the QR code on the screen again.</p>
                    </div>
                </body>
            `);
        }

        if (!playerHtmlCache) {
            const playerMobilePath = path.join(__dirname, '../public/mobile-player.html');
            if (fs.existsSync(playerMobilePath)) {
                playerHtmlCache = fs.readFileSync(playerMobilePath, 'utf8');
            } else {
                return res.status(404).send('Player page not found.');
            }
        }
        res.type('html').send(playerHtmlCache);
    });

    // Issue player session token
    expressApp.get('/api/player-session', (req: Request, res: Response) => {
        const urlGuid = req.query.auth;
        const rejoinToken = req.query.rejoin as string | undefined;

        let authorized = urlGuid === currentPlayerGuid;
        let rejoinTeamName: string | null = null;

        if (typeof rejoinToken === 'string' && rejoinTokens.has(rejoinToken)) {
            authorized = true;
            rejoinTeamName = rejoinTokens.get(rejoinToken)!;
            // Don't delete here — let the Socket.IO rejoin-with-token handler consume it
        }

        if (!authorized) {
            return res.status(403).json({ error: 'Invalid auth' });
        }

        const sessionToken = crypto.randomBytes(32).toString('hex');
        approvedPlayerSessionTokens.add(sessionToken);
        res.json({ sessionToken, rejoinTeamName });
    });

    server.listen(3001, '0.0.0.0', () => { // Bind to all interfaces explicitly
        console.log('Mobile remote server running on port 3001');
    });

    ioServer.on('connection', (socket) => {
        console.log(`Mobile Remote Connected: ${socket.id}`);

        // Issue a session token so the client survives app-switches and page reloads
        const sessionToken = crypto.randomBytes(32).toString('hex');
        approvedSessionTokens.add(sessionToken);
        socket.emit('session-token', sessionToken);

        // Notify Dashboard windows that a mobile client connected
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                win.webContents.send('mobile-connected');
            }
        });

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

    // === Player namespace (/player) ===
    playerNamespace = ioServer.of('/player');

    playerNamespace.use((socket, next) => {
        const queryAuth = socket.handshake.query.auth;
        const providedAuth = Array.isArray(queryAuth) ? queryAuth[0] : queryAuth;
        const sessionToken = socket.handshake.query.session;
        const providedSession = Array.isArray(sessionToken) ? sessionToken[0] : sessionToken;

        if (providedSession && approvedPlayerSessionTokens.has(providedSession)) {
            return next();
        }
        if (providedAuth === currentPlayerGuid) {
            return next();
        }

        return next(new Error('AUTH_FAILED'));
    });

    playerNamespace.on('connection', (socket) => {
        console.log(`Player connected: ${socket.id}`);

        // Issue session token
        const sessionToken = crypto.randomBytes(32).toString('hex');
        approvedPlayerSessionTokens.add(sessionToken);
        socket.emit('player-session-token', sessionToken);

        // --- Team Creation ---
        socket.on('create-team', (data: { teamName: string }, callback) => {
            const gs = latestGameState as GameState;
            const name = (data.teamName || '').trim();

            if (!name || name.length > 50) {
                return callback({ error: 'Team name must be 1-50 characters.' });
            }
            if (gs && gs.teamsLocked) {
                return callback({ error: 'Teams are locked. The quiz has already started.' });
            }
            const lowerName = name.toLowerCase();
            if (playerTeams.has(lowerName)) {
                return callback({ error: 'A team with this name already exists.' });
            }
            if (gs?.teams.some(t => t.name.toLowerCase() === lowerName)) {
                return callback({ error: 'A team with this name already exists.' });
            }

            // Register team server-side
            playerTeams.set(lowerName, {
                teamName: name,
                socketId: socket.id,
                sessionToken,
            });
            playerSessions.set(socket.id, { teamName: name, sessionToken });

            // Add team to GameState
            if (gs) {
                gs.teams = [...gs.teams, { name, score: 0, allInUsed: false }];
                latestGameState = gs;

                // Broadcast updated GameState to all windows and quizmaster sockets
                BrowserWindow.getAllWindows().forEach(win => {
                    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                        win.webContents.send('state-updated', gs);
                        win.webContents.send('player-team-joined', { teamName: name });
                    }
                });
                if (ioServer) {
                    ioServer.emit('state-updated', gs);
                    ioServer.emit('player-team-joined', { teamName: name });
                }
                broadcastToAllPlayers();
            }

            callback({ success: true, teamName: name });

            // Send initial player view
            if (gs) {
                socket.emit('player-view-update', buildPlayerViewState(gs, name));
            }
        });

        // --- Rejoin with team name (same device, page reload / re-scan) ---
        socket.on('rejoin-team', (data: { teamName: string }, callback) => {
            const requestedName = (data.teamName || '').trim();
            if (!requestedName) {
                return callback({ error: 'No team name provided.' });
            }

            const lowerName = requestedName.toLowerCase();
            const teamRecord = playerTeams.get(lowerName);
            if (!teamRecord) {
                return callback({ error: 'Team not found. It may have been removed.' });
            }

            // Disconnect old socket for this team if still connected
            if (teamRecord.socketId && teamRecord.socketId !== socket.id && playerNamespace) {
                const oldSocket = playerNamespace.sockets.get(teamRecord.socketId);
                if (oldSocket) {
                    oldSocket.emit('session-replaced');
                    oldSocket.disconnect(true);
                }
            }

            // Update team record with new socket and session token
            teamRecord.socketId = socket.id;
            teamRecord.sessionToken = sessionToken;
            playerSessions.set(socket.id, { teamName: teamRecord.teamName, sessionToken });

            callback({ success: true, teamName: teamRecord.teamName });

            const gs = latestGameState as GameState;
            if (gs) {
                socket.emit('player-view-update', buildPlayerViewState(gs, teamRecord.teamName));
            }
        });

        // --- Rejoin with one-time token (from quizmaster's rejoin QR) ---
        socket.on('rejoin-with-token', (data: { rejoinToken: string }, callback) => {
            const teamName = rejoinTokens.get(data.rejoinToken);
            if (!teamName) {
                return callback({ error: 'Rejoin link expired or invalid.' });
            }

            rejoinTokens.delete(data.rejoinToken); // One-time use
            const lowerName = teamName.toLowerCase();
            const teamRecord = playerTeams.get(lowerName);
            if (!teamRecord) {
                return callback({ error: 'Team no longer exists.' });
            }

            // Disconnect old socket if still connected
            if (teamRecord.socketId && playerNamespace) {
                const oldSocket = playerNamespace.sockets.get(teamRecord.socketId);
                if (oldSocket) {
                    oldSocket.emit('session-replaced');
                    oldSocket.disconnect(true);
                }
            }

            // Update to new socket
            teamRecord.socketId = socket.id;
            const newSessionToken = crypto.randomBytes(32).toString('hex');
            teamRecord.sessionToken = newSessionToken;
            approvedPlayerSessionTokens.add(newSessionToken);
            playerSessions.set(socket.id, { teamName, sessionToken: newSessionToken });

            socket.emit('player-session-token', newSessionToken);
            callback({ success: true, teamName });

            const gs = latestGameState as GameState;
            if (gs) {
                socket.emit('player-view-update', buildPlayerViewState(gs, teamName));
            }
        });

        // --- Answer Submission ---
        socket.on('submit-answer', (data: { answer: string; lockedIn: boolean }) => {
            const session = playerSessions.get(socket.id);
            if (!session) return;

            const gs = latestGameState as GameState;
            if (!gs || gs.showAnswer) return;

            const phase = getPlayerPhase(gs);
            if (phase !== 'answering') return;

            const existing = playerAnswers.get(session.teamName);
            const changeCount = existing
                ? existing.changeCount + (existing.answer !== data.answer.trim() ? 1 : 0)
                : 0;

            playerAnswers.set(session.teamName, {
                teamName: session.teamName,
                answer: data.answer.trim(),
                lockedIn: data.lockedIn,
                lastChanged: new Date().toISOString(),
                changeCount,
            });

            broadcastAnswersToQuizmasters();
            socket.emit('player-view-update', buildPlayerViewState(gs, session.teamName));
        });

        // --- All-In Activation ---
        socket.on('activate-all-in', (data: undefined, callback) => {
            const session = playerSessions.get(socket.id);
            if (!session) return callback?.({ error: 'Not connected' });

            const gs = latestGameState as GameState;
            if (!gs) return callback?.({ error: 'No game active' });

            const teamIdx = gs.teams.findIndex(t => t.name === session.teamName);
            if (teamIdx === -1) return callback?.({ error: 'Team not found' });

            const team = gs.teams[teamIdx];
            if (team.allInUsed) return callback?.({ error: 'All-In already used' });

            const isFinalQuestion =
                gs.activeArtistIndex === gs.quizData.length - 1 && gs.activeTier === 5;
            if (isFinalQuestion) return callback?.({ error: 'Cannot use All-In on the final question' });

            // Apply All-In
            gs.teams = [...gs.teams];
            gs.teams[teamIdx] = { ...team, allInUsed: true };
            gs.allInActive = true;
            latestGameState = gs;

            // Broadcast to everyone
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                    win.webContents.send('state-updated', gs);
                }
            });
            if (ioServer) ioServer.emit('state-updated', gs);
            broadcastToAllPlayers();

            callback?.({ success: true });
        });

        // --- Wager Submission ---
        socket.on('submit-wager', (data: { wager: number }) => {
            const session = playerSessions.get(socket.id);
            if (!session) return;

            const gs = latestGameState as GameState;
            if (!gs || gs.wagersLocked) return;

            const teamIdx = gs.teams.findIndex(t => t.name === session.teamName);
            if (teamIdx === -1) return;

            const team = gs.teams[teamIdx];
            const clampedWager = Math.min(team.score, Math.max(0, Math.floor(data.wager)));

            gs.teams = [...gs.teams];
            gs.teams[teamIdx] = { ...team, wager: clampedWager };
            latestGameState = gs;

            // Broadcast to all windows and quizmaster sockets
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
                    win.webContents.send('state-updated', gs);
                }
            });
            if (ioServer) ioServer.emit('state-updated', gs);
            broadcastToAllPlayers();
        });

        // --- Disconnect ---
        socket.on('disconnect', (reason) => {
            console.log(`Player disconnected (${socket.id}): ${reason}`);
            const session = playerSessions.get(socket.id);
            if (session) {
                const lowerName = session.teamName.toLowerCase();
                const teamRecord = playerTeams.get(lowerName);
                if (teamRecord && teamRecord.socketId === socket.id) {
                    teamRecord.socketId = null; // Mark disconnected but keep team
                }
                playerSessions.delete(socket.id);
            }
        });
    });

    return getLocalIP();
});

ipcMain.handle('list-provider-models', async (_event, provider: string, apiKeyOverride?: string) => {
    const cfg = getConfig() as Record<string, string>;
    const key = apiKeyOverride || cfg[`${provider}Key`] || '';
    if (!key) return [];
    return listProviderModels(provider as Parameters<typeof listProviderModels>[0], key);
});

ipcMain.handle('generate-trivia', async (_event, provider: string, model: string, prompt: string) => {
    const cfg = getConfig();
    const keyMap: Record<string, string> = {
        gemini: cfg.geminiKey,
        openai: cfg.openaiKey,
        anthropic: cfg.anthropicKey,
        groq: cfg.groqKey,
        mistral: cfg.mistralKey,
    };
    const apiKey = keyMap[provider];
    if (!apiKey) throw new Error(`No API key configured for provider: ${provider}`);
    return fetchTriviaCompletion(provider as Parameters<typeof fetchTriviaCompletion>[0], apiKey, model, prompt);
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
