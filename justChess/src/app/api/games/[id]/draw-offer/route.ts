/**
 * POST /api/games/[id]/draw-offer — offer, accept, or decline a draw
 * Body: { action: "offer" | "accept" | "decline" }
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { gameService } from "@/services/game.service";
import { ok, Errors } from "@/lib/api-response";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["offer", "accept", "decline"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const { id } = await params;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Errors.badRequest("Invalid action");

    const { action } = parsed.data;

    if (action === "accept") {
      const result = await gameService.acceptDraw(id, session.user.id);
      if (!result.success) return Errors.badRequest(result.error ?? "Cannot accept draw");
      return ok({ gameEnded: true, result: "draw", resultReason: "agreement" });
    }

    if (action === "offer") {
      const result = await gameService.offerDraw(id, session.user.id);
      if (!result.success) return Errors.badRequest(result.error ?? "Cannot offer draw");
      return ok({ action, gameId: id });
    }
  } catch (err) {
    console.error("[POST /api/games/[id]/draw-offer]", err);
    return Errors.internal();
  }
}
