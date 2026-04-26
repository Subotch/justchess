/**
 * useGameStore — manages the current active game state
 *
 * State machine:
 *   idle → waiting → playing → (completed | resigned | draw | abandoned)
 */

"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  ChessMove,
  GameResult,
  GameResultReason,
  GameState,
  GameStatus,
  PieceColor,
} from "@/types/game";

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

interface GameStore {
  // Current game
  game: GameState | null;
  myColor: PieceColor | null;

  // UI state
  selectedSquare: string | null;
  legalMoves: string[];
  lastMove: { from: string; to: string } | null;
  isAnimating: boolean;

  // Draw offer
  drawOfferedByOpponent: boolean;
  drawOfferedByMe: boolean;

  // Reconnect state
  opponentDisconnected: boolean;
  reconnectDeadlineMs: number | null;

  // Optimistic move (before server confirmation)
  pendingMove: { from: string; to: string; promotion?: string } | null;

  // Actions
  setGame: (game: GameState) => void;
  setMyColor: (color: PieceColor) => void;
  applyMove: (move: ChessMove, fen: string, pgn: string, currentTurn: PieceColor) => void;
  updateClocks: (whiteMs: number, blackMs: number) => void;
  setGameEnded: (result: GameResult, reason: GameResultReason) => void;
  setDrawOffered: (byColor: PieceColor) => void;
  clearDrawOffer: () => void;
  setOpponentDisconnected: (deadline: number) => void;
  setOpponentReconnected: () => void;
  selectSquare: (square: string | null) => void;
  setLegalMoves: (moves: string[]) => void;
  setPendingMove: (move: { from: string; to: string; promotion?: string } | null) => void;
  setSpectatorCount: (count: number) => void;
  reset: () => void;
}

// ─────────────────────────────────────────────
// INITIAL STATE
// ─────────────────────────────────────────────

const initialState = {
  game: null,
  myColor: null,
  selectedSquare: null,
  legalMoves: [],
  lastMove: null,
  isAnimating: false,
  drawOfferedByOpponent: false,
  drawOfferedByMe: false,
  opponentDisconnected: false,
  reconnectDeadlineMs: null,
  pendingMove: null,
};

// ─────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────

export const useGameStore = create<GameStore>()(
  immer((set) => ({
    ...initialState,

    setGame: (game) =>
      set((state) => {
        state.game = game;
      }),

    setMyColor: (color) =>
      set((state) => {
        state.myColor = color;
      }),

    applyMove: (move, fen, pgn, currentTurn) =>
      set((state) => {
        if (!state.game) return;
        state.game.moves.push(move);
        state.game.fen = fen;
        state.game.pgn = pgn;
        state.game.currentTurn = currentTurn;
        state.game.moveCount += 1;
        state.lastMove = { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) };
        state.selectedSquare = null;
        state.legalMoves = [];
        state.pendingMove = null;
        state.isAnimating = true;
      }),

    updateClocks: (whiteMs, blackMs) =>
      set((state) => {
        if (!state.game) return;
        state.game.white.timeRemainingMs = whiteMs;
        state.game.black.timeRemainingMs = blackMs;
      }),

    setGameEnded: (result, reason) =>
      set((state) => {
        if (!state.game) return;
        state.game.result = result;
        state.game.resultReason = reason;
        state.game.status = "completed";
        state.drawOfferedByMe = false;
        state.drawOfferedByOpponent = false;
      }),

    setDrawOffered: (byColor) =>
      set((state) => {
        if (state.myColor && byColor !== state.myColor) {
          state.drawOfferedByOpponent = true;
        } else {
          state.drawOfferedByMe = true;
        }
      }),

    clearDrawOffer: () =>
      set((state) => {
        state.drawOfferedByOpponent = false;
        state.drawOfferedByMe = false;
      }),

    setOpponentDisconnected: (deadline) =>
      set((state) => {
        state.opponentDisconnected = true;
        state.reconnectDeadlineMs = deadline;
      }),

    setOpponentReconnected: () =>
      set((state) => {
        state.opponentDisconnected = false;
        state.reconnectDeadlineMs = null;
      }),

    selectSquare: (square) =>
      set((state) => {
        state.selectedSquare = square;
      }),

    setLegalMoves: (moves) =>
      set((state) => {
        state.legalMoves = moves;
      }),

    setPendingMove: (move) =>
      set((state) => {
        state.pendingMove = move;
      }),

    setSpectatorCount: (count) =>
      set((state) => {
        if (state.game) state.game.spectatorCount = count;
      }),

    reset: () => set(() => ({ ...initialState })),
  }))
);
