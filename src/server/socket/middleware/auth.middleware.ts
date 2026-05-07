/**
 * Socket.IO authentication middleware
 * Validates the session cookie/token before allowing connection
 */

import type { Socket } from "socket.io";
import type { SocketData } from "@/types/socket";

export async function authenticateSocket(
  socket: Socket<any, any, any, SocketData>,
  next: (err?: Error) => void
): Promise<void> {
  try {
    // Extract session token from handshake auth or cookie
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
        cookie: socket.handshake.headers.cookie || "",
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
      .set({ isOnline: true })
      .where(eq(users.id, session.user.id))
      .catch(console.error);

    next();
  } catch (err) {
    console.error("[Socket Auth] Error:", err);
    next(new Error("Authentication failed"));
  }
}

function parseCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
