/**
 * POST /api/games/[id]/resign
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const { id } = await params;

    const result = await gameService.resign(id, session.user.id);
    if (!result.success) {
      return Errors.badRequest(result.error ?? "Cannot resign");
    }

    return ok({
      gameEnded: true,
      result: result.result,
      resultReason: result.resultReason,
    });
  } catch (err) {
    console.error("[POST /api/games/[id]/resign]", err);
    return Errors.internal();
  }
}
