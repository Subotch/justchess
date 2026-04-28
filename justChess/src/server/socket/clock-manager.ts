/**
 * Clock Manager — manages chess clocks for active games server-side.
 * Runs in the Node.js process alongside Socket.IO.
 *
 * Concurrency model:
 *   Although Node.js is single-threaded, Socket.IO handlers are async and may
 *   interleave at `await` points. To guarantee that "check current active color
 *   → mutate state" happens atomically, all state-mutating operations on a
 *   given game are serialized through a per-game async queue (see queue.ts).
 */

import type { PieceColor } from "@/types/game";
import { AsyncQueue } from "./queue";

/**
 * Result of a switchTurn() operation.
 */
export interface SwitchTurnResult {
  success: boolean;
  /** true if the increment was actually applied (i.e. no race condition guard tripped). */
  appliedIncrement: boolean;
  newActiveColor: PieceColor;
  whiteTimeMs: number;
  blackTimeMs: number;
  reason?: string;
}

interface GameClockState {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  incrementMs: number;
  activeColor: PieceColor;
  lastTickAt: number; // Date.now() when last tick happened
  intervalId: NodeJS.Timeout | null;
  reconnectTimers: Map<string, NodeJS.Timeout>;
}

type ClockTickCallback = (state: {
  gameId: string;
  whiteTimeMs: number;
  blackTimeMs: number;
  activeColor: PieceColor;
}) => void;

type TimeoutCallback = () => void;

class ClockManager {
  private clocks = new Map<string, GameClockState>();
  private tickCallbacks = new Map<string, ClockTickCallback>();
  private timeoutCallbacks = new Map<string, TimeoutCallback>();
  /** Single per-key async queue — all mutations for a given gameId are serialized. */
  private queue = new AsyncQueue();

  /**
   * Start a clock for a game.
   */
  startClock(
    gameId: string,
    whitePlayerId: string,
    blackPlayerId: string | null,
    whiteTimeMs: number,
    blackTimeMs: number,
    incrementMs: number,
    activeColor: PieceColor,
    onTick: ClockTickCallback,
    onTimeout: TimeoutCallback
  ): void {
    // Stop existing clock if any
    this.stopClock(gameId);

    const state: GameClockState = {
      gameId,
      whitePlayerId,
      blackPlayerId,
      whiteTimeMs,
      blackTimeMs,
      incrementMs,
      activeColor,
      lastTickAt: Date.now(),
      intervalId: null,
      reconnectTimers: new Map(),
    };

    this.clocks.set(gameId, state);
    this.tickCallbacks.set(gameId, onTick);
    this.timeoutCallbacks.set(gameId, onTimeout);

    // Tick every 100ms for accuracy
    state.intervalId = setInterval(() => this.tick(gameId), 100);
  }

  private tick(gameId: string): void {
    const state = this.clocks.get(gameId);
    if (!state) return;

    const now = Date.now();
    const elapsed = now - state.lastTickAt;
    state.lastTickAt = now;

    // Decrement active player's clock
    if (state.activeColor === "white") {
      state.whiteTimeMs = Math.max(0, state.whiteTimeMs - elapsed);
    } else {
      state.blackTimeMs = Math.max(0, state.blackTimeMs - elapsed);
    }

    const onTick = this.tickCallbacks.get(gameId);
    if (onTick) {
      onTick({
        gameId,
        whiteTimeMs: state.whiteTimeMs,
        blackTimeMs: state.blackTimeMs,
        activeColor: state.activeColor,
      });
    }

    // Check for timeout
    const activeTime =
      state.activeColor === "white" ? state.whiteTimeMs : state.blackTimeMs;

    if (activeTime <= 0) {
      // Save callback before stopClock, which deletes it from the map
      const onTimeout = this.timeoutCallbacks.get(gameId);
      this.stopClock(gameId);
      if (onTimeout) onTimeout();
    }
  }

  /**
   * Switch the active clock after a move (and apply increment).
   *
   * This is an atomic operation — check and update happen together, serialized
   * through the per-game async queue. If `expectedActiveColor` is provided and
   * does not match the current active color at the moment of execution, the
   * increment is NOT applied and the result reports `appliedIncrement: false`.
   *
   * @param gameId               - The game ID
   * @param expectedActiveColor  - Expected current active color (race-condition guard)
   */
  switchTurn(
    gameId: string,
    expectedActiveColor?: PieceColor
  ): Promise<SwitchTurnResult> {
    return this.queue.enqueue<SwitchTurnResult>(gameId, async () => {
      const state = this.clocks.get(gameId);
      if (!state) {
        return {
          success: false,
          appliedIncrement: false,
          newActiveColor: "white",
          whiteTimeMs: 0,
          blackTimeMs: 0,
          reason: "Clock not found",
        };
      }

      const currentColor = state.activeColor;

      // Race-condition guard: if caller expected a different active color,
      // it means another move was already processed between caller's read and
      // this enqueued operation — bail out without applying increment.
      if (
        expectedActiveColor !== undefined &&
        currentColor !== expectedActiveColor
      ) {
        console.warn(
          `[ClockManager] Race condition detected in ${gameId}: ` +
            `expected ${expectedActiveColor}, got ${currentColor}. Increment NOT applied.`
        );
        return {
          success: true,
          appliedIncrement: false,
          newActiveColor: currentColor,
          whiteTimeMs: state.whiteTimeMs,
          blackTimeMs: state.blackTimeMs,
          reason: `Color mismatch: expected ${expectedActiveColor}, got ${currentColor}`,
        };
      }

      // Apply increment to the player who just moved and switch turn
      if (currentColor === "white") {
        state.whiteTimeMs += state.incrementMs;
        state.activeColor = "black";
      } else {
        state.blackTimeMs += state.incrementMs;
        state.activeColor = "white";
      }

      state.lastTickAt = Date.now();

      return {
        success: true,
        appliedIncrement: true,
        newActiveColor: state.activeColor,
        whiteTimeMs: state.whiteTimeMs,
        blackTimeMs: state.blackTimeMs,
      };
    });
  }

  /**
   * Pause the clock (e.g., on disconnect).
   */
  pauseClock(gameId: string): void {
    const state = this.clocks.get(gameId);
    if (!state || !state.intervalId) return;
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  /**
   * Resume a paused clock.
   */
  resumeClock(gameId: string): void {
    const state = this.clocks.get(gameId);
    if (!state || state.intervalId) return;
    state.lastTickAt = Date.now();
    state.intervalId = setInterval(() => this.tick(gameId), 100);
  }

  /**
   * Stop and remove a clock.
   */
  stopClock(gameId: string): void {
    const state = this.clocks.get(gameId);
    if (!state) return;

    if (state.intervalId) {
      clearInterval(state.intervalId);
    }

    // Clear reconnect timers
    for (const timer of state.reconnectTimers.values()) {
      clearTimeout(timer);
    }

    // Clear queue for this game
    this.queue.clear(gameId);

    this.clocks.delete(gameId);
    this.tickCallbacks.delete(gameId);
    this.timeoutCallbacks.delete(gameId);
  }

  /**
   * Get current clock state for a game.
   */
  getGameState(gameId: string): GameClockState | undefined {
    return this.clocks.get(gameId);
  }

  /**
   * Get remaining time for both players.
   */
  getTimeRemaining(gameId: string): { white: number; black: number } | null {
    const state = this.clocks.get(gameId);
    if (!state) return null;
    return { white: state.whiteTimeMs, black: state.blackTimeMs };
  }

  /**
   * Schedule a reconnect timeout — if player doesn't reconnect, forfeit.
   */
  scheduleReconnectTimeout(
    gameId: string,
    userId: string,
    delayMs: number,
    onExpire: () => void
  ): void {
    const state = this.clocks.get(gameId);
    if (!state) return;

    // Clear existing timer for this user
    const existing = state.reconnectTimers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      state.reconnectTimers.delete(userId);
      onExpire();
    }, delayMs);

    state.reconnectTimers.set(userId, timer);
  }

  /**
   * Cancel a reconnect timeout (player reconnected in time).
   */
  cancelReconnectTimeout(gameId: string, userId: string): void {
    const state = this.clocks.get(gameId);
    if (!state) return;

    const timer = state.reconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      state.reconnectTimers.delete(userId);
    }
  }
}

// Singleton instance
export const clockManager = new ClockManager();
