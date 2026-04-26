/**
 * POST /api/games/[id]/resign
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const { id } = await params;
  const result = await gameService.resign(id, session.user.id);

  if (!result.success) return Errors.badRequest(result.error ?? "Cannot resign");

  return ok(result);
}
