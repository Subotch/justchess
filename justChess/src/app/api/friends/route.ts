/**
 * GET  /api/friends/list  — get friend list
 * POST /api/friends/request — send friend request
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { friendships, users, userStats } from "@/db/schema";
import { eq, or, and } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { friendLimiter, withRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const FriendRequestSchema = z.object({
  addresseeId: z.string().min(1),
});

// GET /api/friends — list friends and pending requests
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const userId = session.user.id;

  const allFriendships = await db.query.friendships.findMany({
    where: or(
      eq(friendships.requesterId, userId),
      eq(friendships.addresseeId, userId)
    ),
  });

  // Enrich with user data
  const enriched = await Promise.all(
    allFriendships.map(async (f) => {
      const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId;
      const direction = f.requesterId === userId ? "sent" : "received";

      const otherUser = await db.query.users.findFirst({
        where: eq(users.id, otherId),
        with: { stats: true },
      });

      return {
        friendshipId: f.id,
        user: otherUser
          ? {
              id: otherUser.id,
              username: otherUser.username,
              name: otherUser.name,
              image: otherUser.image,
              isOnline: otherUser.isOnline,
              lastSeenAt: otherUser.lastSeenAt?.toISOString() ?? null,
              ratingRapid: otherUser.stats?.ratingRapid ?? 1200,
              ratingBlitz: otherUser.stats?.ratingBlitz ?? 1200,
            }
          : null,
        status: f.status,
        direction,
        createdAt: f.createdAt.toISOString(),
      };
    })
  );

  return ok(enriched);
}

// POST /api/friends — send friend request
export async function POST(req: NextRequest) {
  const limited = await withRateLimit(req, friendLimiter);
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const body = await req.json();
  const parsed = FriendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.badRequest("Invalid request", parsed.error.flatten().fieldErrors as any);
  }

  const { addresseeId } = parsed.data;
  const requesterId = session.user.id;

  if (requesterId === addresseeId) {
    return Errors.badRequest("Cannot send friend request to yourself");
  }

  // Check if addressee exists
  const addressee = await db.query.users.findFirst({
    where: eq(users.id, addresseeId),
  });
  if (!addressee) return Errors.notFound("User");

  // Check for existing friendship
  const existing = await db.query.friendships.findFirst({
    where: or(
      and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)),
      and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId))
    ),
  });

  if (existing) {
    if (existing.status === "accepted") return Errors.conflict("Already friends");
    if (existing.status === "pending") return Errors.conflict("Friend request already sent");
    if (existing.status === "blocked") return Errors.forbidden();
  }

  const [friendship] = await db
    .insert(friendships)
    .values({ requesterId, addresseeId, status: "pending" })
    .returning();

  return ok({ friendshipId: friendship.id, status: "pending" }, 201);
}
