/**
 * Socket.IO authentication middleware
 * Validates the session token from the handshake and attaches user data to socket.
 */

import type { Socket } from "socket.io";
import type { SocketData } from "@/types/socket";

export async function authenticateSocket(
  socket: Socket<any, any, any, SocketData>,
  next: (err?: Error) => void
): Promise<void> {
  try {
    // Token can come from auth handshake or cookie
    const token =
      socket.handshake.auth?.token ||
      parseCookieToken(socket.handshake.headers.cookie);

    if (!token) {
      return next(new Error("Authentication required"));
    }

    // Validate session via Better-Auth
    const { auth } = await import("@/lib/auth");
    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: `better-auth.session_token=${token}`,
      }),
    });

    if (!session?.user) {
      return next(new Error("Invalid or expired session"));
    }

    // Attach user data to socket
    socket.data.userId = session.user.id;
    socket.data.username = (session.user as any).username || session.user.name;
    socket.data.isInQueue = false;

    // Mark user as online
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    await db
      .update(users)
      .set({ isOnline: true, lastSeenAt: new Date() })
      .where(eq(users.id, session.user.id));

    next();
  } catch (error) {
    console.error("[Socket Auth] Error:", error);
    next(new Error("Authentication failed"));
  }
}

function parseCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match ? match[1] : null;
}
