/**
 * GET /api/users/[id]/games
 * Public game history for a specific user.
 * Query params:
 *   page          number  (default 1)
 *   pageSize      number  (default 20, max 50)
 *   gameType      rated|casual|friendly|ai
 *   timingCategory bullet|blitz|rapid|classical
 *   sortBy        endedAt|result (default endedAt)
 *   sortDir       asc|desc (default desc)
 *   opponent      string  – partial match on opponent username or name
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { games, users } from "@/db/schema";
import { eq, or, and, desc, asc, ilike, sql } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  // Verify user exists
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true },
  });
  if (!user) return Errors.notFound("User");

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));
  const gameType = searchParams.get("gameType") ?? undefined;
  const timingCategory = searchParams.get("timingCategory") ?? undefined;
  const sortBy = searchParams.get("sortBy") ?? "endedAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const opponent = searchParams.get("opponent")?.trim() ?? undefined;

  const offset = (page - 1) * pageSize;

  try {
    // Build base conditions
    const baseConditions = [
      or(eq(games.whitePlayerId, id), eq(games.blackPlayerId, id))!,
      eq(games.status, "completed"),
    ];

    if (gameType) {
      baseConditions.push(eq(games.gameType, gameType as any));
    }
    if (timingCategory) {
      baseConditions.push(eq(games.timingCategory, timingCategory as any));
    }

    // If opponent filter is set, find matching user ids first
    let opponentIds: string[] | undefined;
    if (opponent) {
      const matchingUsers = await db.query.users.findMany({
        where: or(
          ilike(users.username, `%${opponent}%`),
          ilike(users.name, `%${opponent}%`)
        ),
        columns: { id: true },
        limit: 100,
      });
      opponentIds = matchingUsers.map((u) => u.id);
      if (opponentIds.length === 0) {
        // No opponents match → return empty
        return ok({ items: [], total: 0, page, pageSize, hasMore: false });
      }
      // The current user must play against one of these opponents
      baseConditions.push(
        or(
          ...opponentIds.flatMap((oid) => [
            and(eq(games.whitePlayerId, id), eq(games.blackPlayerId, oid))!,
            and(eq(games.whitePlayerId, oid), eq(games.blackPlayerId, id))!,
          ])
        )!
      );
    }

    const where = and(...baseConditions);

    // Order
    const orderCol = sortBy === "result" ? games.result : games.endedAt;
    const order = sortDir === "asc" ? asc(orderCol) : desc(orderCol);

    const [items, countResult] = await Promise.all([
      db.query.games.findMany({
        where,
        orderBy: [order],
        limit: pageSize,
        offset,
        with: {
          whitePlayer: { columns: { id: true, username: true, name: true, image: true } },
          blackPlayer: { columns: { id: true, username: true, name: true, image: true } },
        },
      }),
      db.select({ count: sql<number>`count(*)` }).from(games).where(where),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return ok({
      items: items.map((g) => {
        const isWhite = g.whitePlayerId === id;
        const opponent = isWhite ? g.blackPlayer : g.whitePlayer;
        return {
          id: g.id,
          opponent: opponent
            ? { id: opponent.id, username: opponent.username, name: opponent.name, image: opponent.image }
            : null,
          color: isWhite ? "white" : "black",
          result: g.result,
          resultReason: g.resultReason,
          gameType: g.gameType,
          timingCategory: g.timingCategory,
          timeControlMinutes: g.timeControlMinutes,
          incrementSeconds: g.incrementSeconds,
          totalMoves: g.totalMoves,
          isAiGame: g.isAiGame,
          aiDifficulty: g.aiDifficulty,
          startedAt: g.startedAt?.toISOString() ?? null,
          endedAt: g.endedAt?.toISOString() ?? null,
          createdAt: g.createdAt.toISOString(),
        };
      }),
      total,
      page,
      pageSize,
      hasMore: offset + items.length < total,
    });
  } catch (err) {
    console.error("[GET /api/users/[id]/games]", err);
    return Errors.internal();
  }
}
