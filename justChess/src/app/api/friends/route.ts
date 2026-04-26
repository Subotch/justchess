/**
 * GET  /api/friends/list — get friend list
 * POST /api/friends/request — send friend request
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { friendships, users, userStats } from "@/db/schema";
import { eq, or, and } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter, friendLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const requestSchema = z.object({
  addresseeId: z.string().min(1),
});

// GET /api/friends/list
export async function GET(req: NextRequest) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const userId = session.user.id;

    const friendList = await db.query.friendships.findMany({
      where: or(
        eq(friendships.requesterId, userId),
        eq(friendships.addresseeId, userId)
      ),
      with: {
        requester: {
          columns: { id: true, username: true, name: true, image: true, isOnline: true, lastSeenAt: true },
          with: { stats: { columns: { ratingRapid: true, ratingBlitz: true } } },
        },
        addressee: {
          columns: { id: true, username: true, name: true, image: true, isOnline: true, lastSeenAt: true },
          with: { stats: { columns: { ratingRapid: true, ratingBlitz: true } } },
        },
      },
    });

    const items = friendList.map((f) => {
      const isSender = f.requesterId === userId;
      const otherUser = isSender ? f.addressee : f.requester;
      const otherStats = (otherUser as any).stats;

      return {
        friendshipId: f.id,
        user: {
          id: otherUser.id,
          username: otherUser.username,
          name: otherUser.name,
          image: otherUser.image,
          isOnline: otherUser.isOnline,
          lastSeenAt: otherUser.lastSeenAt?.toISOString() ?? null,
          ratingRapid: otherStats?.ratingRapid ?? 1200,
          ratingBlitz: otherStats?.ratingBlitz ?? 1200,
        },
        status: f.status,
        direction: isSender ? "sent" : "received",
        createdAt: f.createdAt.toISOString(),
      };
    });

    return ok(items);
  } catch (err) {
    console.error("[GET /api/friends/list]", err);
    return Errors.internal();
  }
}

// POST /api/friends/request
export async function POST(req: NextRequest) {
  const limited = await withRateLimit(req, friendLimiter);
  if (limited) return limited;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Errors.badRequest("Validation failed");
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
  } catch (err) {
    console.error("[POST /api/friends/request]", err);
    return Errors.internal();
  }
}
