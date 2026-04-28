/**
 * Shared game types — used on both client and server
 */

// ─────────────────────────────────────────────
// ENUMS / LITERALS
// ─────────────────────────────────────────────

export type GameType = "rated" | "casual" | "ai" | "tournament";

export type GameResult =
  | "white_wins"
  | "black_wins"
  | "draw"
  | "abandoned"
  | "in_progress";

export type GameResultReason =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "stalemate"
  | "insufficient_material"
  | "threefold_repetition"
  | "fifty_move_rule"
  | "agreement"
  | "abandoned";

export type GameStatus =
  | "waiting"
  | "active"
  | "paused"
  | "completed"
  | "abandoned";

export type PieceColor = "white" | "black";

export type TimingCategory =
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "correspondence";

// ─────────────────────────────────────────────
// TIME CONTROL
// ─────────────────────────────────────────────

export interface TimeControl {
  minutes: number;
  incrementSeconds: number;
  category: TimingCategory;
}

export const TIME_CONTROLS: TimeControl[] = [
  { minutes: 1, incrementSeconds: 0, category: "bullet" },
  { minutes: 1, incrementSeconds: 1, category: "bullet" },
  { minutes: 2, incrementSeconds: 1, category: "bullet" },
  { minutes: 3, incrementSeconds: 0, category: "blitz" },
  { minutes: 3, incrementSeconds: 2, category: "blitz" },
  { minutes: 5, incrementSeconds: 0, category: "blitz" },
  { minutes: 5, incrementSeconds: 3, category: "blitz" },
  { minutes: 10, incrementSeconds: 0, category: "rapid" },
  { minutes: 10, incrementSeconds: 5, category: "rapid" },
  { minutes: 15, incrementSeconds: 10, category: "rapid" },
  { minutes: 30, incrementSeconds: 0, category: "classical" },
  { minutes: 30, incrementSeconds: 20, category: "classical" },
];

export function getTimingCategory(minutes: number): TimingCategory {
  if (minutes < 3) return "bullet";
  if (minutes < 10) return "blitz";
  if (minutes < 30) return "rapid";
  return "classical";
}

// ─────────────────────────────────────────────
// MOVE
// ─────────────────────────────────────────────

export interface ChessMove {
  san: string;       // Standard Algebraic Notation: "Nf3"
  uci: string;       // UCI format: "g1f3"
  fen: string;       // FEN after this move
  moveNumber: number;
  color: PieceColor;
  timeSpentMs?: number;
  clockRemainingMs?: number;
  evalCp?: number;   // centipawns evaluation
}

export interface MoveRequest {
  gameId: string;
  from: string;      // e.g. "e2"
  to: string;        // e.g. "e4"
  promotion?: "q" | "r" | "b" | "n";
}

// ─────────────────────────────────────────────
// PLAYER
// ─────────────────────────────────────────────

export interface GamePlayer {
  id: string;
  username: string;
  name: string;
  image?: string | null;
  rating: number;
  color: PieceColor;
  timeRemainingMs: number;
  isConnected: boolean;
}

// ─────────────────────────────────────────────
// GAME STATE (client-side representation)
// ─────────────────────────────────────────────

export interface GameState {
  id: string;
  status: GameStatus;
  gameType: GameType;
  timingCategory: TimingCategory;
  timeControlMinutes: number;
  incrementSeconds: number;

  white: GamePlayer;
  black: GamePlayer;

  // Chess state
  fen: string;
  pgn: string;
  moves: ChessMove[];
  currentTurn: PieceColor;
  moveCount: number;

  // Result
  result: GameResult;
  resultReason?: GameResultReason;

  // Draw offer state
  drawOfferedBy?: PieceColor;

  // AI
  isAiGame: boolean;
  aiDifficulty?: number;
  aiColor?: PieceColor; // Which color the AI plays

  // Spectators
  spectatorCount: number;

  // Timestamps
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────
// AI DIFFICULTY
// ─────────────────────────────────────────────

export interface AiDifficultyLevel {
  level: number;       // 1–20
  name: string;        // "Beginner", "Intermediate", etc.
  elo: number;         // Approximate ELO
  skillLevel: number;  // Stockfish skill level 0–20
  depth?: number;      // Search depth limit
  description: string;
}

export const AI_DIFFICULTY_LEVELS: AiDifficultyLevel[] = [
  { level: 1,  name: "Beginner",      elo: 800,  skillLevel: 0,  depth: 1,  description: "Just learning the rules" },
  { level: 2,  name: "Novice",        elo: 900,  skillLevel: 1,  depth: 1,  description: "Knows basic tactics" },
  { level: 3,  name: "Amateur",       elo: 1000, skillLevel: 2,  depth: 2,  description: "Plays simple openings" },
  { level: 4,  name: "Casual",        elo: 1100, skillLevel: 3,  depth: 2,  description: "Avoids obvious blunders" },
  { level: 5,  name: "Club Player",   elo: 1200, skillLevel: 4,  depth: 3,  description: "Understands basic strategy" },
  { level: 6,  name: "Intermediate",  elo: 1300, skillLevel: 5,  depth: 3,  description: "Plays solid openings" },
  { level: 7,  name: "Advanced",      elo: 1400, skillLevel: 7,  depth: 4,  description: "Tactical awareness" },
  { level: 8,  name: "Strong",        elo: 1500, skillLevel: 8,  depth: 4,  description: "Positional understanding" },
  { level: 9,  name: "Expert",        elo: 1600, skillLevel: 10, depth: 5,  description: "Consistent tactical play" },
  { level: 10, name: "Candidate",     elo: 1700, skillLevel: 11, depth: 5,  description: "Strong endgame technique" },
  { level: 11, name: "Class A",       elo: 1800, skillLevel: 12, depth: 6,  description: "Deep calculation" },
  { level: 12, name: "Class B",       elo: 1900, skillLevel: 13, depth: 6,  description: "Complex strategy" },
  { level: 13, name: "Class C",       elo: 2000, skillLevel: 14, depth: 7,  description: "Near-master level" },
  { level: 14, name: "National Master", elo: 2100, skillLevel: 15, depth: 7, description: "Master-level play" },
  { level: 15, name: "FIDE Master",   elo: 2200, skillLevel: 16, depth: 8,  description: "FIDE Master strength" },
  { level: 16, name: "IM",            elo: 2300, skillLevel: 17, depth: 9,  description: "International Master" },
  { level: 17, name: "GM",            elo: 2400, skillLevel: 18, depth: 10, description: "Grandmaster strength" },
  { level: 18, name: "Super GM",      elo: 2600, skillLevel: 19, depth: 12, description: "Super Grandmaster" },
  { level: 19, name: "World Class",   elo: 2800, skillLevel: 20, depth: 15, description: "World Championship level" },
  { level: 20, name: "Maximum",       elo: 3200, skillLevel: 20, depth: 20, description: "Full Stockfish strength" },
];

// ─────────────────────────────────────────────
// MATCHMAKING
// ─────────────────────────────────────────────

export interface MatchmakingRequest {
  gameType: "rated" | "casual";
  timeControlMinutes: number;
  incrementSeconds: number;
  ratingRange?: number; // ±rating to search within
}

export interface MatchmakingEntry {
  userId: string;
  username: string;
  rating: number;
  request: MatchmakingRequest;
  joinedAt: number; // timestamp ms
  lastHeartbeat?: number; // timestamp ms, for TTL
}

// ─────────────────────────────────────────────
// GAME HISTORY
// ─────────────────────────────────────────────

export interface GameHistoryItem {
  id: string;
  opponent: {
    id: string;
    username: string;
    name: string;
    image?: string | null;
    rating: number;
  } | null;
  color: PieceColor;
  result: GameResult;
  resultReason?: GameResultReason;
  gameType: GameType;
  timingCategory: TimingCategory;
  timeControlMinutes: number;
  incrementSeconds: number;
  totalMoves: number;
  ratingBefore?: number;
  ratingAfter?: number;
  ratingChange?: number;
  openingName?: string;
  isAiGame: boolean;
  aiDifficulty?: number;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────
// LIVE GAME (for spectator list)
// ─────────────────────────────────────────────

export interface LiveGame {
  id: string;
  white: { username: string; rating: number };
  black: { username: string; rating: number };
  timingCategory: TimingCategory;
  timeControlMinutes: number;
  moveCount: number;
  spectatorCount: number;
  startedAt: string;
}
