/**
 * /api/users/[id]/settings — Account settings (password, email, username)
 * All sensitive operations require current password verification.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { users, accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, Errors } from "@/lib/api-response";
import { withRateLimit, apiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(128),
});

const changeEmailSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newEmail: z.string().email("Invalid email address"),
});

const changeUsernameSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newUsername: z.string().min(3, "Username must be at least 3 characters").max(30).regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores allowed"),
});

const changeNameSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newName: z.string().min(1, "Name is required").max(100),
});

const changeBioSchema = z.object({
  newBio: z.string().max(500, "Bio must be 500 characters or less").optional(),
});

/**
 * Verify current password against stored hash in accounts table.
 */
async function verifyCurrentPassword(userId: string, currentPassword: string): Promise<boolean> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, userId),
  });

  if (!account?.password) {
    return false;
  }

  return bcrypt.compare(currentPassword, account.password);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await withRateLimit(req, apiLimiter);
  if (limited) return limited;

  const { id } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return Errors.unauthorized();
    if (session.user.id !== id) return Errors.forbidden();

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "changePassword": {
        const parsed = changePasswordSchema.safeParse(body);
        if (!parsed.success) {
          return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
        }

        const { currentPassword, newPassword } = parsed.data;

        const valid = await verifyCurrentPassword(id, currentPassword);
        if (!valid) {
          return Errors.badRequest("Incorrect current password");
        }

        const hashed = await bcrypt.hash(newPassword, 12);

        // Update password in accounts table
        await db
          .update(accounts)
          .set({ password: hashed, updatedAt: new Date() })
          .where(eq(accounts.userId, id));

        return ok({ message: "Password changed successfully" });
      }

      case "changeEmail": {
        const parsed = changeEmailSchema.safeParse(body);
        if (!parsed.success) {
          return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
        }

        const { currentPassword, newEmail } = parsed.data;

        const valid = await verifyCurrentPassword(id, currentPassword);
        if (!valid) {
          return Errors.badRequest("Incorrect current password");
        }

        // Check email uniqueness
        const existing = await db.query.users.findFirst({
          where: eq(users.email, newEmail),
        });
        if (existing && existing.id !== id) {
          return Errors.conflict("Email already in use");
        }

        await db
          .update(users)
          .set({ email: newEmail, updatedAt: new Date() })
          .where(eq(users.id, id));

        return ok({ message: "Email changed successfully" });
      }

      case "changeUsername": {
        const parsed = changeUsernameSchema.safeParse(body);
        if (!parsed.success) {
          return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
        }

        const { currentPassword, newUsername } = parsed.data;

        const valid = await verifyCurrentPassword(id, currentPassword);
        if (!valid) {
          return Errors.badRequest("Incorrect current password");
        }

        // Check username uniqueness
        const existing = await db.query.users.findFirst({
          where: eq(users.username, newUsername),
        });
        if (existing && existing.id !== id) {
          return Errors.conflict("Username already taken");
        }

        await db
          .update(users)
          .set({ username: newUsername, updatedAt: new Date() })
          .where(eq(users.id, id));

        return ok({ message: "Username changed successfully" });
      }

      case "changeName": {
        const parsed = changeNameSchema.safeParse(body);
        if (!parsed.success) {
          return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
        }

        const { currentPassword, newName } = parsed.data;

        const valid = await verifyCurrentPassword(id, currentPassword);
        if (!valid) {
          return Errors.badRequest("Incorrect current password");
        }

        await db
          .update(users)
          .set({ name: newName, updatedAt: new Date() })
          .where(eq(users.id, id));

        return ok({ message: "Name changed successfully" });
      }

      case "changeBio": {
        const parsed = changeBioSchema.safeParse(body);
        if (!parsed.success) {
          return Errors.badRequest("Validation failed", parsed.error.flatten().fieldErrors as Record<string, string[]>);
        }

        const { newBio } = parsed.data;

        await db
          .update(users)
          .set({ bio: newBio ?? null, updatedAt: new Date() })
          .where(eq(users.id, id));

        return ok({ message: "Bio updated successfully" });
      }

      default:
        return Errors.badRequest("Unknown action");
    }
  } catch (err) {
    console.error("[PATCH /api/users/[id]/settings]", err);
    return Errors.internal();
  }
}
