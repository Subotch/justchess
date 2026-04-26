/**
 * GET /api/games/history?page=1&pageSize=20&gameType=rated&timingCategory=rapid
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { apiLimiter, withRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, parseInt(searchParams.get("pageSize") ?? "20"));
  const gameType = searchParams.get("gameType") ?? undefined;
  const timingCategory = searchParams.get("timingCategory") ?? undefined;

  const result = await gameService.getGameHistory(
    session.user.id,
    page,
    pageSize,
    { gameType, timingCategory }
  );

  return ok(result);
}
