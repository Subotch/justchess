/**
 * GET /api/ai/difficulty-levels
 */

import { NextRequest } from "next/server";
import { ok } from "@/lib/api-response";
import { AI_DIFFICULTY_LEVELS } from "@/types/game";

export async function GET(_req: NextRequest) {
  return ok(AI_DIFFICULTY_LEVELS);
}
