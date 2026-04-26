/**
 * Chess engine utilities — client-side chess.js wrapper
 * Used for: legal move validation, FEN/PGN parsing, move highlighting
 */

import { Chess } from "chess.js";
import type { PieceColor } from "@/types/game";

/**
 * Get all legal moves from a square in the current position.
 * Returns target squares.
 */
export function getLegalMovesFrom(fen: string, square: string): string[] {
  const chess = new Chess(fen);
  const moves = chess.moves({ square: square as any, verbose: true });
  return moves.map((m) => m.to);
}

/**
 * Check if a move is legal in the current position.
 */
export function isLegalMove(
  fen: string,
  from: string,
  to: string,
  promotion?: string
): boolean {
  const chess = new Chess(fen);
  const move = chess.move({ from, to, promotion } as any);
  return move !== null;
}

/**
 * Apply a move and return the new FEN.
 */
export function applyMove(
  fen: string,
  from: string,
  to: string,
  promotion?: string
): { fen: string; san: string; pgn: string } | null {
  const chess = new Chess(fen);
  const move = chess.move({ from, to, promotion } as any);
  if (!move) return null;
  return { fen: chess.fen(), san: move.san, pgn: chess.pgn() };
}

/**
 * Get the current turn from a FEN string.
 */
export function getTurnFromFen(fen: string): PieceColor {
  const chess = new Chess(fen);
  return chess.turn() === "w" ? "white" : "black";
}

/**
 * Check game state from FEN.
 */
export function getGameState(fen: string) {
  const chess = new Chess(fen);
  return {
    isCheck: chess.inCheck(),
    isCheckmate: chess.isCheckmate(),
    isStalemate: chess.isStalemate(),
    isDraw: chess.isDraw(),
    isInsufficientMaterial: chess.isInsufficientMaterial(),
    isThreefoldRepetition: chess.isThreefoldRepetition(),
    isGameOver: chess.isGameOver(),
    turn: chess.turn() === "w" ? "white" : "black",
  };
}

/**
 * Parse PGN and return all positions (for game replay).
 */
export function parsePgnPositions(pgn: string): Array<{
  fen: string;
  san: string;
  moveNumber: number;
  color: PieceColor;
}> {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const history = chess.history({ verbose: true });
  const positions: Array<{
    fen: string;
    san: string;
    moveNumber: number;
    color: PieceColor;
  }> = [];

  // Replay from start
  const replay = new Chess();
  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    replay.move(move.san);
    positions.push({
      fen: replay.fen(),
      san: move.san,
      moveNumber: Math.floor(i / 2) + 1,
      color: move.color === "w" ? "white" : "black",
    });
  }

  return positions;
}

/**
 * Get piece on a square.
 */
export function getPieceOnSquare(fen: string, square: string) {
  const chess = new Chess(fen);
  return chess.get(square as any);
}

/**
 * Check if a square has a piece of the given color.
 */
export function isOwnPiece(fen: string, square: string, color: PieceColor): boolean {
  const piece = getPieceOnSquare(fen, square);
  if (!piece) return false;
  return piece.color === (color === "white" ? "w" : "b");
}

/**
 * Get the king's square for a given color.
 */
export function getKingSquare(fen: string, color: PieceColor): string | null {
  const chess = new Chess(fen);
  const board = chess.board();
  const colorChar = color === "white" ? "w" : "b";

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type === "k" && piece.color === colorChar) {
        const files = "abcdefgh";
        return `${files[file]}${8 - rank}`;
      }
    }
  }
  return null;
}

/**
 * Format time in mm:ss format.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Format time with tenths of seconds (for < 10 seconds).
 */
export function formatTimePrecise(ms: number): string {
  if (ms >= 10_000) return formatTime(ms);
  const seconds = Math.max(0, ms / 1000);
  return seconds.toFixed(1);
}
