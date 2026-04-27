/**
 * API request/response types for all REST endpoints
 */

import type {
  GameHistoryItem,
  GameState,
  GameType,
  LiveGame,
  MatchmakingRequest,
  PieceColor,
  TimingCategory,
} from "./game";

// ─────────────────────────────────────────────
// GENERIC API RESPONSE WRAPPER
// ─────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>; // field-level validation errors
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─────────────────────────────────────────────
// PAGINATION
// ─────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─────────────────────────────────────────────
// AUTH — /api/auth/*
// ─────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  username: string | null;
  name: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: string;
}

export interface SessionResponse {
  user: AuthUserResponse;
  expiresAt: string;
}

// ─────────────────────────────────────────────
// USERS — /api/users/*
// ─────────────────────────────────────────────

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  boardTheme: "classic" | "wood" | "green" | "blue" | "purple";
  pieceSet: "standard" | "neo" | "alpha" | "cburnett";
  soundEnabled: boolean;
  showCoordinates: boolean;
  autoPromoteToQueen: boolean;
  showLegalMoves: boolean;
  animationSpeed: "none" | "fast" | "normal" | "slow";
}

export interface UserProfileResponse {
  id: string;
  username: string | null;
  friendCode: string;
  name: string;
  image: string | null;
  bio: string | null;
  country: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  stats: {
    ratingRapid: number;
    ratingBlitz: number;
    ratingBullet: number;
    ratingClassical: number;
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    gamesDrawn: number;
    currentWinStreak: number;
    bestWinStreak: number;
  };
  recentGames: GameHistoryItem[];
  isFriend?: boolean;
  friendshipStatus?: "pending" | "accepted" | "rejected" | "blocked" | null;
}

export interface UpdateProfileRequest {
  username?: string;
  name?: string;
  bio?: string;
  country?: string;
  image?: string;
  preferences?: Partial<UserPreferences>;
}

export interface UserStatsResponse {
  ratingRapid: number;
  ratingBlitz: number;
  ratingBullet: number;
  ratingClassical: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  gamesAbandoned: number;
  currentWinStreak: number;
  bestWinStreak: number;
  currentDailyStreak: number;
  bestDailyStreak: number;
  winRate: number; // percentage
  aiGamesPlayed: number;
  aiGamesWon: number;
  lastGameAt: string | null;
}

export interface RatingHistoryPoint {
  date: string;
  rating: number;
  change: number;
  gameId: string | null;
}

export interface RatingHistoryResponse {
  timingCategory: TimingCategory;
  history: RatingHistoryPoint[];
  currentRating: number;
  peakRating: number;
  lowestRating: number;
}

// ─────────────────────────────────────────────
// FRIENDS — /api/friends/*
// ─────────────────────────────────────────────

export interface FriendRequestPayload {
  addresseeId?: string;
  friendCode?: string;
}

export interface FriendListItem {
  friendshipId: string;
  user: {
    id: string;
    username: string | null;
    friendCode: string;
    name: string;
    image: string | null;
    isOnline: boolean;
    lastSeenAt: string | null;
    ratingRapid: number;
    ratingBlitz: number;
  };
  status: "pending" | "accepted" | "rejected" | "blocked";
  direction: "sent" | "received";
  createdAt: string;
}

// ─────────────────────────────────────────────
// GAMES — /api/games/*
// ─────────────────────────────────────────────

export interface CreateGameRequest {
  gameType: GameType;
  timeControlMinutes: number;
  incrementSeconds: number;
  // For AI games
  isAiGame?: boolean;
  aiDifficulty?: number; // 1–20
  playerColor?: PieceColor | "random";
  // For friend challenges
  opponentId?: string;
}

export interface CreateGameResponse {
  gameId: string;
  color: PieceColor;
  game: GameState;
}

export interface MakeMoveRequest {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export interface MakeMoveResponse {
  move: {
    san: string;
    uci: string;
    fen: string;
    moveNumber: number;
    color: PieceColor;
  };
  fen: string;
  pgn: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  gameEnded: boolean;
  result?: string;
  resultReason?: string;
}

export interface GameResponse {
  id: string;
  status: string;
  gameType: GameType;
  timingCategory: TimingCategory;
  timeControlMinutes: number;
  incrementSeconds: number;
  white: {
    id: string | null;
    username: string | null;
    name: string | null;
    image: string | null;
    rating: number | null;
    timeRemainingMs: number | null;
  };
  black: {
    id: string | null;
    username: string | null;
    name: string | null;
    image: string | null;
    rating: number | null;
    timeRemainingMs: number | null;
  };
  fen: string;
  pgn: string | null;
  result: string;
  resultReason: string | null;
  isAiGame: boolean;
  aiDifficulty: number | null;
  totalMoves: number;
  spectatorCount: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface GameMovesResponse {
  gameId: string;
  moves: Array<{
    moveNumber: number;
    color: PieceColor;
    san: string;
    uci: string;
    fen: string;
    timeSpentMs: number | null;
    clockRemainingMs: number | null;
  }>;
}

export interface GameHistoryQuery {
  page?: number;
  pageSize?: number;
  gameType?: GameType;
  timingCategory?: TimingCategory;
  result?: "win" | "loss" | "draw";
}

export interface LiveGamesQuery {
  page?: number;
  pageSize?: number;
  timingCategory?: TimingCategory;
  minRating?: number;
  maxRating?: number;
}

// ─────────────────────────────────────────────
// AI — /api/ai/*
// ─────────────────────────────────────────────

export interface AnalyzePositionRequest {
  fen: string;
  depth?: number;    // 1–20, default 15
  multiPv?: number;  // number of best lines, default 1
}

export interface AnalyzePositionResponse {
  fen: string;
  depth: number;
  lines: Array<{
    rank: number;
    score: { type: "cp" | "mate"; value: number };
    moves: string[]; // UCI moves
    san: string[];   // SAN moves
  }>;
  bestMove: string;  // UCI
  bestMoveSan: string;
}

// ─────────────────────────────────────────────
// ACHIEVEMENTS — /api/achievements/*
// ─────────────────────────────────────────────

export interface AchievementResponse {
  id: string;
  name: string;
  description: string;
  category: "gameplay" | "social" | "milestone" | "special";
  iconUrl: string | null;
  points: number;
  isSecret: boolean;
  // If fetching user achievements, these are populated
  earned?: boolean;
  earnedAt?: string;
  gameId?: string | null;
}

export interface UserAchievementsResponse {
  achievements: AchievementResponse[];
  totalPoints: number;
  earnedCount: number;
  totalCount: number;
}
