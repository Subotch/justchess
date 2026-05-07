/**
 * PATCH /api/friends/request/[id]/reject
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { friendships } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();

    const { id } = await params;
    const userId = session.user.id;

    const friendship = await db.query.friendships.findFirst({
      where: and(eq(friendships.id, id), eq(friendships.addresseeId, userId)),
    });

    if (!friendship) return Errors.notFound("Friend request");
    if (friendship.status !== "pending") {
      return Errors.badRequest("Request is not pending");
    }

    const [updated] = await db
      .update(friendships)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(friendships.id, id))
      .returning();

    return ok({ friendshipId: updated.id, status: updated.status });
  } catch (err) {
    console.error("[PATCH /api/friends/request/[id]/reject]", err);
    return Errors.internal();
  }
}
