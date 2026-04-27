/**
 * API route to check if username or email is available
 * POST /api/auth/check-availability
 * Body: { username?: string, email?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, email } = body;

    const result = {
      usernameAvailable: true,
      emailAvailable: true,
      usernameError: null as string | null,
      emailError: null as string | null,
    };

    // Check username if provided
    if (username && username.trim().length > 0) {
      const existingUserByUsername = await db.query.users.findFirst({
        where: eq(users.username, username.trim().toLowerCase()),
      });

      if (existingUserByUsername) {
        result.usernameAvailable = false;
        result.usernameError = "Имя пользователя уже занято";
      }
    }

    // Check email if provided
    if (email && email.trim().length > 0) {
      const existingUserByEmail = await db.query.users.findFirst({
        where: eq(users.email, email.trim().toLowerCase()),
      });

      if (existingUserByEmail) {
        result.emailAvailable = false;
        result.emailError = "Email уже зарегистрирован";
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error checking availability:", error);
    return NextResponse.json(
      { error: "Ошибка проверки доступности" },
      { status: 500 }
    );
  }
}
