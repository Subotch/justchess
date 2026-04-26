/**
 * POST /api/games        — create a new game
 * GET  /api/games/history — game history
 * GET  /api/games/live   — live games
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const CreateGameSchema = z.object({
  gameType: z.enum(["rated", "casual", "ai"]),
  timeControlMinutes: z.number().int().min(1).max(180),
  incrementSeconds: z.number().int().min(0).max(60),
  isAiGame: z.boolean().optional().default(false),
  aiDifficulty: z.number().int().min(1).max(20).optional(),
  playerColor: z.enum(["white", "black", "random"]).optional().default("random"),
});

export async function POST(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const body = await req.json();
  const parsed = CreateGameSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as any);
  }

  const { gameType, timeControlMinutes, incrementSeconds, isAiGame, aiDifficulty, playerColor } =
    parsed.data;

  const userId = session.user.id;

  // Determine colors
  let whitePlayerId: string;
  let blackPlayerId: string | null = null;
  let aiColor: "white" | "black" | undefined;

  if (isAiGame) {
    const resolvedColor =
      playerColor === "random"
        ? Math.random() < 0.5
          ? "white"
          : "black"
        : playerColor;

    if (resolvedColor === "white") {
      whitePlayerId = userId;
      aiColor = "black";
    } else {
      whitePlayerId = userId; // AI is white, but we still track human
      aiColor = "white";
      blackPlayerId = null;
    }
  } else {
    whitePlayerId = userId;
  }

  const game = await gameService.createGame({
    whitePlayerId,
    blackPlayerId,
    gameType,
    timeControlMinutes,
    incrementSeconds,
    isAiGame,
    aiDifficulty,
    aiColor,
  });

  // For AI games, start immediately
  if (isAiGame) {
    await gameService.startGame(game.id);
  }

  const color = aiColor === "white" ? "black" : "white";

  return ok(
    {
      gameId: game.id,
      color: isAiGame ? color : "white",
      game,
    },
    201
  );
}
