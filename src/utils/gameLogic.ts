import type { QuizArtist } from '../services/ai';

export interface SavedTeam {
    name: string;
    active: boolean;
}

export interface Team {
    name: string;
    score: number;
    allInUsed: boolean;
    wager?: number;
}

/** A team's answer submission for the current question. Stored server-side only. */
export interface TeamAnswer {
    teamName: string;
    answer: string;
    lockedIn: boolean;
    /** ISO timestamp of last answer change */
    lastChanged: string;
    /** Number of times the answer text was changed (not counting lock/unlock toggles) */
    changeCount: number;
}

/** Server-side record of a registered player team */
export interface PlayerTeamRecord {
    teamName: string;         // Display name (original casing)
    socketId: string | null;  // null if disconnected
    sessionToken: string;
}

/** The screen/phase a player's phone should display */
export type PlayerPhase =
    | 'lobby'       // Waiting for game to start
    | 'answering'   // Question visible, answer not yet revealed
    | 'waiting'     // Answer revealed or between questions
    | 'wager'       // Final question — wager entry
    | 'gameover';   // Quiz complete

/** Data sent to a specific player's phone to tell them what to show */
export interface PlayerViewState {
    phase: PlayerPhase;
    /** This team's info */
    teamName: string;
    teamScore: number;
    allInUsed: boolean;
    /** true if team can still use All-In (!allInUsed AND not final question) */
    allInAvailable: boolean;
    /** Current position in quiz */
    artistIndex: number;
    tier: number;
    totalArtists: number;
    /** For wager phase */
    maxWager: number;
    currentWager: number | null;
    wagersLocked: boolean;
    /** This team's own current answer (no other team's answers!) */
    currentAnswer: string;
    currentLockedIn: boolean;
    /** Timer */
    timerEndTime: number | null;
    /** Sorted leaderboard (all teams, name + score only) */
    leaderboard: { name: string; score: number }[];
    /** Whether this team is the winner (for gameover phase) */
    isWinner: boolean;
    /** This team's current rank (1-based) */
    rank: number;
}

/** Payload sent to quizmaster clients with all team answers */
export interface QuizmasterAnswerData {
    answers: TeamAnswer[];
}

/** Data returned when generating a rejoin QR */
export interface RejoinQrData {
    teamName: string;
    rejoinToken: string;
    url: string;
}

export interface GameState {
    activeArtistIndex: number;
    activeTier: number; // 0 for Unlock, 1-5 for Lore Ladder
    showAnswer: boolean;
    showBoard: boolean;
    showLeaderboard: boolean;
    quizData: QuizArtist[];
    allInActive: boolean;
    winnerMode: boolean;
    teams: Team[];
    wagersLocked: boolean;
    spotifyMobileMode?: 'desktop' | 'mobile_app' | 'mobile_web';
    timerEndTime: number | null;
    timerDuration: number;
    timerAutoStart: boolean;
    /** Whether the game is in lobby phase (teams can still join) */
    lobbyMode: boolean;
    /** Whether the player QR code should be visible on Presentation */
    showPlayerQr: boolean;
    /** Whether team registration is locked (set true when quiz starts) */
    teamsLocked: boolean;
    /** Full URL for the player QR code (set by Dashboard, consumed by Presentation) */
    playerQrUrl: string;
}

export const INITIAL_GAME_STATE: GameState = {
    activeArtistIndex: 0,
    activeTier: 0,
    showAnswer: false,
    showBoard: false,
    showLeaderboard: true,
    quizData: [],
    allInActive: false,
    winnerMode: false,
    teams: [],
    wagersLocked: false,
    spotifyMobileMode: 'desktop',
    timerEndTime: null,
    timerDuration: 30,
    timerAutoStart: false,
    lobbyMode: true,
    showPlayerQr: false,
    teamsLocked: false,
    playerQrUrl: '',
};

export const calculatePoints = (isAllInActive: boolean, addedPoints: number): number => {
    let multiplier = 1;
    if (isAllInActive && addedPoints > 0) {
        multiplier = 2;
    }
    return addedPoints * multiplier;
};

export const getNextState = (state: GameState): GameState => {
    const newState: GameState = { ...state, showAnswer: false, allInActive: false, showBoard: false, timerEndTime: null, lobbyMode: false, teamsLocked: true };
    if (newState.activeTier < 5) {
        newState.activeTier++;
    } else if (newState.activeArtistIndex < newState.quizData.length - 1) {
        newState.activeArtistIndex++;
        newState.activeTier = 0; // Phase 1: The Unlock
    } else {
        newState.winnerMode = true;
    }
    // Auto-start timer for the new question if enabled
    if (newState.timerAutoStart && !newState.winnerMode) {
        newState.timerEndTime = Date.now() + newState.timerDuration * 1000;
    }
    return newState;
};

export const getPrevState = (state: GameState): GameState => {
    const newState: GameState = { ...state, showAnswer: false, allInActive: false, showBoard: false, timerEndTime: null };
    if (newState.activeTier > 0) {
        newState.activeTier--;
    } else if (newState.activeArtistIndex > 0) {
        newState.activeArtistIndex--;
        newState.activeTier = 5;
    }
    return newState;
};
