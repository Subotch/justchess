/**
 * Socket.IO event types — shared between client and server
 *
 * Naming convention:
 *   ClientToServer: events emitted by the client, received by the server
 *   ServerToClient: events emitted by the server, received by the client
 *   InterServerEvents: events between Socket.IO server nodes (for scaling)
 */

import type {
  ChessMove,
  GameResult,
  GameResultReason,
  GameState,
  GameStatus,
  LiveGame,
  PieceColor,
} from "./game";

// ─────────────────────────────────────────────
// CLIENT → SERVER EVENTS
// ─────────────────────────────────────────────

export interface ClientToServerEvents {
  /**
   * Join an active game room as a player.
   * Server validates that the user is a participant.
   */
  "game:join": (payload: { gameId: string }) => void;

  /**
   * Make a move in the game.
   * Server validates legality before broadcasting.
   */
  "game:move": (payload: {
    gameId: string;
    from: string;
    to: string;
    promotion?: "q" | "r" | "b" | "n";
  }) => void;

  /**
   * Resign from the current game.
   */
  "game:resign": (payload: { gameId: string }) => void;

  /**
   * Offer a draw to the opponent.
   */
  "game:offer_draw": (payload: { gameId: string }) => void;

  /**
   * Accept a draw offer from the opponent.
   */
  "game:accept_draw": (payload: { gameId: string }) => void;

  /**
   * Decline a draw offer from the opponent.
   */
  "game:decline_draw": (payload: { gameId: string }) => void;

  /**
   * Send a chat message in the game room.
   */
  "game:chat_message": (payload: {
    gameId: string;
    message: string;
  }) => void;

  /**
   * Join a game as a spectator.
   */
  "spectator:join": (payload: { gameId: string }) => void;

  /**
   * Leave spectator mode.
   */
  "spectator:leave": (payload: { gameId: string }) => void;

  /**
   * Join the matchmaking queue.
   */
  "lobby:join_queue": (payload: {
    gameType: "rated" | "casual";
    timeControlMinutes: number;
    incrementSeconds: number;
  }) => void;

  /**
   * Leave the matchmaking queue.
   */
  "lobby:leave_queue": () => void;

  /**
   * Challenge a specific friend to a game.
   */
  "lobby:challenge_friend": (payload: {
    friendId: string;
    timeControlMinutes: number;
    incrementSeconds: number;
  }) => void;

  /**
   * Accept a friend challenge.
   */
  "lobby:accept_challenge": (payload: { challengeId: string }) => void;

  /**
   * Decline a friend challenge.
   */
  "lobby:decline_challenge": (payload: { challengeId: string }) => void;
}

// ─────────────────────────────────────────────
// SERVER → CLIENT EVENTS
// ─────────────────────────────────────────────

export interface ServerToClientEvents {
  /**
   * Game has started — sent to both players.
   */
  "game:started": (payload: { game: GameState }) => void;

  /**
   * A move was made and validated by the server.
   */
  "game:move_made": (payload: {
    gameId: string;
    move: ChessMove;
    fen: string;
    pgn: string;
    currentTurn: PieceColor;
    whiteTimeRemainingMs: number;
    blackTimeRemainingMs: number;
  }) => void;

  /**
   * Clock update — sent every second during active game.
   */
  "game:clock_update": (payload: {
    gameId: string;
    whiteTimeRemainingMs: number;
    blackTimeRemainingMs: number;
    activeColor: PieceColor;
  }) => void;

  /**
   * Game has ended.
   */
  "game:ended": (payload: {
    gameId: string;
    result: GameResult;
    reason: GameResultReason;
    pgn: string;
    whiteRatingChange?: number;
    blackRatingChange?: number;
    whiteRatingAfter?: number;
    blackRatingAfter?: number;
  }) => void;

  /**
   * Opponent disconnected — game is paused.
   */
  "game:opponent_disconnected": (payload: {
    gameId: string;
    color: PieceColor;
    reconnectDeadlineMs: number; // timestamp when game will be forfeited
  }) => void;

  /**
   * Opponent reconnected — game resumes.
   */
  "game:opponent_reconnected": (payload: {
    gameId: string;
    color: PieceColor;
  }) => void;

  /**
   * Opponent offered a draw.
   */
  "game:draw_offered": (payload: {
    gameId: string;
    byColor: PieceColor;
  }) => void;

  /**
   * Opponent declined the draw offer.
   */
  "game:draw_declined": (payload: {
    gameId: string;
    byColor: PieceColor;
  }) => void;

  /**
   * Chat message received.
   */
  "game:chat_message": (payload: {
    gameId: string;
    userId: string;
    username: string;
    message: string;
    sentAt: string;
  }) => void;

  /**
   * Spectator count updated.
   */
  "spectator:count_update": (payload: {
    gameId: string;
    count: number;
  }) => void;

  /**
   * An invalid move was attempted.
   */
  "error:invalid_move": (payload: {
    gameId: string;
    reason: string;
  }) => void;

  /**
   * Generic error event.
   */
  "error:generic": (payload: {
    code: string;
    message: string;
  }) => void;

  /**
   * Matchmaking found an opponent — game is being created.
   */
  "lobby:match_found": (payload: {
    gameId: string;
    opponent: {
      id: string;
      username: string;
      rating: number;
    };
    color: PieceColor;
  }) => void;

  /**
   * Matchmaking queue position update.
   */
  "lobby:queue_update": (payload: {
    position: number;
    estimatedWaitSeconds: number;
  }) => void;

  /**
   * A friend challenge was received.
   */
  "lobby:challenge_received": (payload: {
    challengeId: string;
    from: {
      id: string;
      username: string;
      rating: number;
    };
    timeControlMinutes: number;
    incrementSeconds: number;
    expiresAt: string;
  }) => void;

  /**
   * Friend challenge was accepted — game is starting.
   */
  "lobby:challenge_accepted": (payload: {
    challengeId: string;
    gameId: string;
  }) => void;

  /**
   * Friend challenge was declined.
   */
  "lobby:challenge_declined": (payload: {
    challengeId: string;
  }) => void;

  /**
   * Live games list update (for spectator lobby).
   */
  "lobby:live_games_update": (payload: {
    games: LiveGame[];
  }) => void;

  /**
   * New achievement unlocked.
   */
  "achievement:unlocked": (payload: {
    achievementId: string;
    name: string;
    description: string;
    iconUrl?: string;
    points: number;
  }) => void;

  /**
   * Friend came online.
   */
  "social:friend_online": (payload: {
    userId: string;
    username: string;
  }) => void;

  /**
   * Friend went offline.
   */
  "social:friend_offline": (payload: {
    userId: string;
    username: string;
  }) => void;
}

// ─────────────────────────────────────────────
// INTER-SERVER EVENTS (for horizontal scaling)
// ─────────────────────────────────────────────

export interface InterServerEvents {
  "game:sync": (payload: {
    gameId: string;
    state: Partial<GameState>;
  }) => void;
}

// ─────────────────────────────────────────────
// SOCKET DATA (attached to each socket)
// ─────────────────────────────────────────────

export interface SocketData {
  userId: string;
  username: string;
  currentGameId?: string;
  spectatingGameId?: string;
  isInQueue: boolean;
  matchInterval?: NodeJS.Timeout;
}

// ─────────────────────────────────────────────
// ROOM NAMING CONVENTIONS
// ─────────────────────────────────────────────

export const SOCKET_ROOMS = {
  game: (gameId: string) => `game:room:${gameId}`,
  spectator: (gameId: string) => `game:spec:${gameId}`,
  user: (userId: string) => `user:${userId}`,
  lobby: "lobby",
} as const;
