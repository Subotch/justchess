/**
 * PATCH /api/friends/[id]/accept  — accept friend request
 * PATCH /api/friends/[id]/reject  — reject friend request
 * DELETE /api/friends/[id]        — remove friend
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { friendships } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action"); // "accept" | "reject"

  const friendship = await db.query.friendships.findFirst({
    where: eq(friendships.id, id),
  });

  if (!friendship) return Errors.notFound("Friend request");

  // Only the addressee can accept/reject
  if (friendship.addresseeId !== session.user.id) return Errors.forbidden();
  if (friendship.status !== "pending") {
    return Errors.badRequest("Request is no longer pending");
  }

  const newStatus = action === "accept" ? "accepted" : "rejected";

  const [updated] = await db
    .update(friendships)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(friendships.id, id))
    .returning();

  return ok({ friendshipId: updated.id, status: updated.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return Errors.unauthorized();

  const { id } = await params;
  const userId = session.user.id;

  // Can delete if you are either party
  const friendship = await db.query.friendships.findFirst({
    where: and(
      eq(friendships.id, id),
      or(
        eq(friendships.requesterId, userId),
        eq(friendships.addresseeId, userId)
      )
    ),
  });

  if (!friendship) return Errors.notFound("Friendship");

  await db.delete(friendships).where(eq(friendships.id, id));

  return ok({ deleted: true });
}
