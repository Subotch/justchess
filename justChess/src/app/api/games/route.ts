/**
 * POST /api/games/create — create a new game (human vs human or vs AI)
 * GET  /api/games/history — game history for current user
 * GET  /api/games/live — list of live games for spectating
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import type { GameType, PieceColor } from "@/types/game";

const createGameSchema = z.object({
  gameType: z.enum(["rated", "casual", "ai", "tournament"]),
  timeControlMinutes: z.number().int().min(1).max(180),
  incrementSeconds: z.number().int().min(0).max(60),
  isAiGame: z.boolean().optional(),
  aiDifficulty: z.number().int().min(1).max(20).optional(),
  playerColor: z.enum(["white", "black", "random"]).optional(),
  opponentId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const body = await req.json();
    const parsed = createGameSchema.safeParse(body);
    if (!parsed.success) {
      return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }

    const {
      gameType,
      timeControlMinutes,
      incrementSeconds,
      isAiGame = false,
      aiDifficulty,
      playerColor = "random",
      opponentId,
    } = parsed.data;

    const userId = session.user.id;

    // Determine colors
    let whitePlayerId: string;
    let blackPlayerId: string | null;
    let myColor: PieceColor;

    if (isAiGame) {
      const resolvedColor: PieceColor =
        playerColor === "random"
          ? Math.random() < 0.5 ? "white" : "black"
          : (playerColor as PieceColor);

      // AI plays the opposite color
      const aiColor: PieceColor = resolvedColor === "white" ? "black" : "white";

      // If human is white, they are whitePlayerId; if human is black, they are blackPlayerId
      const humanPlayerId = userId;
      const aiPlayerId = null; // AI doesn't have a user ID

      const whitePlayerId = resolvedColor === "white" ? humanPlayerId : aiPlayerId;
      const blackPlayerId = resolvedColor === "black" ? humanPlayerId : aiPlayerId;

      const game = await gameService.createGame({
        whitePlayerId: whitePlayerId!,
        blackPlayerId: blackPlayerId,
        gameType: "ai",
        timeControlMinutes,
        incrementSeconds,
        isAiGame: true,
        aiDifficulty: aiDifficulty ?? 5,
        aiColor: aiColor,
      });

      return ok(
        {
          gameId: game.id,
          color: resolvedColor,
          game: buildGameResponse(game, null, null, timeControlMinutes),
        },
        201
      );
    }

    // Human vs human
    if (opponentId) {
      // Direct challenge
      const isWhite =
        playerColor === "random"
          ? Math.random() < 0.5
          : playerColor === "white";

      const game = await gameService.createGame({
        whitePlayerId: isWhite ? userId : opponentId,
        blackPlayerId: isWhite ? opponentId : userId,
        gameType: gameType as GameType,
        timeControlMinutes,
        incrementSeconds,
      });

      return ok(
        {
          gameId: game.id,
          color: isWhite ? "white" : "black",
          game: buildGameResponse(game, null, null, timeControlMinutes),
        },
        201
      );
    }

    // Matchmaking — create a waiting game
    const game = await gameService.createGame({
      whitePlayerId: userId,
      blackPlayerId: null,
      gameType: gameType as GameType,
      timeControlMinutes,
      incrementSeconds,
    });

    return ok(
      {
        gameId: game.id,
        color: "white" as PieceColor,
        game: buildGameResponse(game, null, null, timeControlMinutes),
      },
      201
    );
  } catch (err) {
    console.error("[POST /api/games]", err);
    return Errors.internal();
  }
}

export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // "history" | "live"

  if (type === "live") {
    try {
      const limit = parseInt(searchParams.get("limit") ?? "20");
      const liveGames = await gameService.getLiveGames(limit);

      return ok(
        liveGames.map((g) => ({
          id: g.id,
          white: {
            username: (g as any).whitePlayer?.username ?? "Player",
            rating: g.whiteRatingBefore ?? 1200,
          },
          black: {
            username: (g as any).blackPlayer?.username ?? "Player",
            rating: g.blackRatingBefore ?? 1200,
          },
          timingCategory: g.timingCategory,
          timeControlMinutes: g.timeControlMinutes,
          moveCount: g.totalMoves,
          spectatorCount: g.peakSpectators,
          startedAt: g.startedAt?.toISOString() ?? g.createdAt.toISOString(),
        }))
      );
    } catch (err) {
      console.error("[GET /api/games?type=live]", err);
      return Errors.internal();
    }
  }

  // History
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const page = parseInt(searchParams.get("page") ?? "1");
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20");
    const gameType = searchParams.get("gameType") ?? undefined;
    const timingCategory = searchParams.get("timingCategory") ?? undefined;

    const result = await gameService.getGameHistory(
      session.user.id,
      page,
      pageSize,
      { gameType, timingCategory }
    );

    const userId = session.user.id;

    return ok({
      items: result.items.map((g) => {
        const isWhite = g.whitePlayerId === userId;
        const opponent = isWhite ? (g as any).blackPlayer : (g as any).whitePlayer;
        return {
          id: g.id,
          opponent: opponent
            ? { id: opponent.id, username: opponent.username, name: opponent.name, image: opponent.image, rating: 1200 }
            : null,
          color: isWhite ? "white" : "black",
          result: g.result,
          resultReason: g.resultReason,
          gameType: g.gameType,
          timingCategory: g.timingCategory,
          timeControlMinutes: g.timeControlMinutes,
          incrementSeconds: g.incrementSeconds,
          totalMoves: g.totalMoves,
          ratingBefore: isWhite ? g.whiteRatingBefore : g.blackRatingBefore,
          ratingAfter: isWhite ? g.whiteRatingAfter : g.blackRatingAfter,
          ratingChange: isWhite
            ? (g.whiteRatingAfter ?? 0) - (g.whiteRatingBefore ?? 0)
            : (g.blackRatingAfter ?? 0) - (g.blackRatingBefore ?? 0),
          openingName: g.openingName,
          isAiGame: g.isAiGame,
          aiDifficulty: g.aiDifficulty,
          startedAt: g.startedAt?.toISOString(),
          endedAt: g.endedAt?.toISOString(),
          createdAt: g.createdAt.toISOString(),
        };
      }),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      hasMore: result.hasMore,
    });
  } catch (err) {
    console.error("[GET /api/games?type=history]", err);
    return Errors.internal();
  }
}

function buildGameResponse(game: any, whitePlayer: any, blackPlayer: any, timeControlMinutes: number) {
  const timeMs = timeControlMinutes * 60 * 1000;
  return {
    id: game.id,
    status: game.status,
    gameType: game.gameType,
    timingCategory: game.timingCategory,
    timeControlMinutes: game.timeControlMinutes,
    incrementSeconds: game.incrementSeconds,
    white: {
      id: game.whitePlayerId ?? null,
      username: whitePlayer?.username ?? null,
      name: whitePlayer?.name ?? null,
      image: whitePlayer?.image ?? null,
      rating: game.whiteRatingBefore ?? null,
      timeRemainingMs: timeMs,
    },
    black: {
      id: game.blackPlayerId ?? null,
      username: blackPlayer?.username ?? null,
      name: blackPlayer?.name ?? null,
      image: blackPlayer?.image ?? null,
      rating: game.blackRatingBefore ?? null,
      timeRemainingMs: timeMs,
    },
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: null,
    result: game.result,
    resultReason: game.resultReason ?? null,
    isAiGame: game.isAiGame,
    aiDifficulty: game.aiDifficulty ?? null,
    aiColor: game.aiColor ?? null,
    totalMoves: game.totalMoves,
    spectatorCount: 0,
    startedAt: game.startedAt?.toISOString() ?? null,
    endedAt: game.endedAt?.toISOString() ?? null,
    createdAt: game.createdAt.toISOString(),
  };
}
