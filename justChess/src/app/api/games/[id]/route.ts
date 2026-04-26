/**
 * GET /api/games/[id] — get game data
 */

import { NextRequest } from "next/server";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;
  const game = await gameService.getGame(id);
  if (!game) return Errors.notFound("Game");

  return ok(game);
}
