import type { QuizArtist } from '../services/gemini';

export interface Team {
    name: string;
    score: number;
    allInUsed: boolean;
    wager?: number;
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
};

export const calculatePoints = (isAllInActive: boolean, addedPoints: number): number => {
    let multiplier = 1;
    if (isAllInActive && addedPoints > 0) {
        multiplier = 2;
    }
    return addedPoints * multiplier;
};

export const getNextState = (state: GameState): GameState => {
    const newState: GameState = { ...state, showAnswer: false, allInActive: false, showBoard: false, timerEndTime: null };
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
