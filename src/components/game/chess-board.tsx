"use client";

/**
 * ChessBoard component — wraps react-chessboard with game logic
 */

import { useCallback, useState, useRef, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useGameStore } from "@/stores/game-store";
import { useUserStore } from "@/stores/user-store";
import { useSocket } from "@/hooks/use-socket";
import { getLegalMovesFrom, isOwnPiece, getGameState } from "@/lib/chess-engine";

interface ChessBoardProps {
  gameId: string;
  readOnly?: boolean;
  fen?: string; // override for review mode
  onMove?: (from: string, to: string, promotion?: string) => void;
}

export function ChessBoard({ gameId, readOnly = false, fen: fenOverride, onMove }: ChessBoardProps) {
  const { game, myColor, selectedSquare, legalMoves, lastMove, pendingMove, selectSquare, setLegalMoves, setPendingMove } = useGameStore();
  const { preferences } = useUserStore();
  const { makeMove } = useSocket();
  const [promotionSquare, setPromotionSquare] = useState<string | null>(null);
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string } | null>(null);
  // Guard against duplicate move submissions from mobile touch events
  const isSubmittingMove = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const fen = fenOverride ?? game?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const isFlipped = myColor === "black";
  const isMyTurn = !readOnly && game?.currentTurn === myColor;

  // Build custom square styles
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  // Highlight last move
  if (lastMove) {
    customSquareStyles[lastMove.from] = { backgroundColor: "rgba(255, 255, 0, 0.3)" };
    customSquareStyles[lastMove.to] = { backgroundColor: "rgba(255, 255, 0, 0.3)" };
  }

  // Highlight selected square
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: "rgba(20, 85, 30, 0.5)" };
  }

  // Highlight legal moves
  if (preferences.showLegalMoves) {
    legalMoves.forEach((sq) => {
      customSquareStyles[sq] = {
        background: "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });
  }

  // Check highlight — find king of the side to move and mark red
  const gameState = getGameState(fen);
  if (gameState.isCheck && !gameState.isCheckmate) {
    const _chess = new Chess(fen);
    const inCheckColor = _chess.turn(); // 'w' | 'b'
    const board = _chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = board[r][c];
        if (sq && sq.type === "k" && sq.color === inCheckColor) {
          const file = String.fromCharCode(97 + c);
          const rank = 8 - r;
          customSquareStyles[`${file}${rank}`] = { backgroundColor: "rgba(220, 0, 0, 0.6)" };
        }
      }
    }
  }

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!isMyTurn || readOnly) return;

      // If a piece is already selected and this is a legal move target
      if (selectedSquare && legalMoves.includes(square)) {
        // Check if promotion needed — only pawns can promote
        const _chess2 = new Chess(fen);
        const piece = _chess2.get(selectedSquare as Parameters<typeof _chess2.get>[0]);
        const isPromotion =
          piece?.type === "p" &&
          ((myColor === "white" && square[1] === "8") ||
            (myColor === "black" && square[1] === "1"));

        if (isPromotion) {
          setPromotionMove({ from: selectedSquare, to: square });
          setPromotionSquare(square);
          return;
        }

        // Make the move
        if (preferences.autoPromoteToQueen) {
          executeMove(selectedSquare, square, "q");
        } else {
          executeMove(selectedSquare, square);
        }
        return;
      }

      // Select a new piece
      if (game?.fen && isOwnPiece(fen, square, myColor!)) {
        selectSquare(square);
        const moves = getLegalMovesFrom(fen, square);
        setLegalMoves(moves);
      } else {
        selectSquare(null);
        setLegalMoves([]);
      }
    },
    [isMyTurn, selectedSquare, legalMoves, myColor, fen, game, preferences, readOnly]
  );

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      if (!isMyTurn || readOnly) return false;

      const moves = getLegalMovesFrom(fen, sourceSquare);
      if (!moves.includes(targetSquare)) return false;

      // Check promotion
      const isPawn = piece.toLowerCase().includes("p");
      const isPromotion =
        isPawn &&
        ((myColor === "white" && targetSquare[1] === "8") ||
          (myColor === "black" && targetSquare[1] === "1"));

      if (isPromotion && !preferences.autoPromoteToQueen) {
        setPromotionMove({ from: sourceSquare, to: targetSquare });
        setPromotionSquare(targetSquare);
        return true;
      }

      executeMove(sourceSquare, targetSquare, isPromotion ? "q" : undefined);
      return true;
    },
    [isMyTurn, fen, myColor, preferences, readOnly]
  );

  const executeMove = (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => {
    // Prevent duplicate submissions from mobile touch events firing multiple times
    if (isSubmittingMove.current) return;
    isSubmittingMove.current = true;
    setTimeout(() => { isSubmittingMove.current = false; }, 600);

    if (onMove) {
      onMove(from, to, promotion);
    } else {
      // Optimistic update
      setPendingMove({ from, to, promotion });
      makeMove(gameId, from, to, promotion);
    }
    selectSquare(null);
    setLegalMoves([]);
  };

  const handlePromotion = (piece: "q" | "r" | "b" | "n") => {
    if (promotionMove) {
      executeMove(promotionMove.from, promotionMove.to, piece);
    }
    setPromotionMove(null);
    setPromotionSquare(null);
  };

  // Auto-focus the board after each move so keyboard input always goes to the board
  useEffect(() => {
    if (!readOnly && boardRef.current) {
      boardRef.current.focus();
    }
  }, [game?.fen, readOnly]);

  return (
    <div className="relative w-full aspect-square">
      <div ref={boardRef} tabIndex={-1} className="w-full h-full outline-none" onKeyDown={() => {}}>
        <Chessboard
          id={`board-${gameId}`}
          position={fen}
          onSquareClick={handleSquareClick}
          onPieceDrop={handlePieceDrop}
          boardOrientation={isFlipped ? "black" : "white"}
          customSquareStyles={customSquareStyles}
          arePiecesDraggable={isMyTurn && !readOnly}
          animationDuration={preferences.animationSpeed === "fast" ? 100 : preferences.animationSpeed === "slow" ? 400 : 200}
          showBoardNotation={preferences.showCoordinates}
          customBoardStyle={{
            borderRadius: "4px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        />
      </div>

      {/* Promotion dialog */}
      {promotionSquare && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 rounded">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 flex gap-3 shadow-xl">
            {(["q", "r", "b", "n"] as const).map((piece) => (
              <button
                key={piece}
                onClick={() => handlePromotion(piece)}
                className="w-16 h-16 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-3xl flex items-center justify-center transition-colors text-slate-800 dark:text-white"
              >
                {piece === "q" ? "♛" : piece === "r" ? "♜" : piece === "b" ? "♝" : "♞"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
