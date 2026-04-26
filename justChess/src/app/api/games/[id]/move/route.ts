/**
 * POST /api/games/[id]/move — make a move (REST fallback, primary path is Socket.IO)
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { moveLimiter, withRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const MoveSchema = z.object({
  from: z.string().length(2),
  to: z.string().length(2),
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, moveLimiter, (r) => {
    const ip = r.headers.get("x-forwarded-for") ?? "anon";
    return `move:${ip}`;
  });
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const { id } = await params;
  const body = await req.json();
  const parsed = MoveSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.badRequest("Invalid move", parsed.error.flatten().fieldErrors as any);
  }

  const result = await gameService.makeMove({
    gameId: id,
    userId: session.user.id,
    ...parsed.data,
  });

  if (!result.success) {
    return Errors.badRequest(result.error ?? "Illegal move");
  }

  return ok(result);
}
