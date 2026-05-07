/**
 * GET /api/ai/difficulty-levels — list all AI difficulty levels
 * POST /api/ai/analyze — analyze a position (server-side, for API consumers)
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";
import { AI_DIFFICULTY_LEVELS } from "@/types/game";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  return ok(AI_DIFFICULTY_LEVELS);
}

const analyzeSchema = z.object({
  fen: z.string().min(10),
  depth: z.number().int().min(1).max(20).optional().default(15),
  multiPv: z.number().int().min(1).max(5).optional().default(1),
});

export async function POST(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const body = await req.json();
    const parsed = analyzeSchema.safeParse(body);
    if (!parsed.success) {
      return Errors.badRequest("Invalid request");
    }

    // Server-side analysis is not implemented (Stockfish runs client-side in Web Worker).
    // This endpoint is a placeholder for future server-side analysis.
    return Errors.badRequest(
      "Server-side analysis not available. Use the client-side Stockfish Web Worker."
    );
  } catch (err) {
    console.error("[POST /api/ai/analyze]", err);
    return Errors.internal();
  }
}
