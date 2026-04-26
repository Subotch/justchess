/**
 * Better-Auth configuration
 * Docs: https://www.better-auth.com/docs
 */

import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

// OAuth configuration - only include if credentials are properly set (not dev placeholders)
const hasGoogleOAuth =
  process.env.GOOGLE_CLIENT_ID &&
  !process.env.GOOGLE_CLIENT_ID.includes("dev-");
const hasGithubOAuth =
  process.env.GITHUB_CLIENT_ID &&
  !process.env.GITHUB_CLIENT_ID.includes("dev-");

const socialProviders = {
  ...(hasGoogleOAuth && {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  }),
  ...(hasGithubOAuth && {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  }),
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  // Email & password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // set true in production
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  // OAuth providers
  socialProviders,

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  // User fields — map Better-Auth fields to our schema
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: false,
        unique: true,
      },
      bio: {
        type: "string",
        required: false,
      },
      country: {
        type: "string",
        required: false,
      },
      isOnline: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      lastSeenAt: {
        type: "date",
        required: false,
      },
      preferences: {
        type: "string",
        required: false,
      },
    },
  },

  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000",

  // Trusted origins for CORS
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000",
  ],

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/sign-up")) {
        return;
      }

      const newUser = ctx.context.newSession?.user;
      if (!newUser?.id) {
        return;
      }

      const existingStats = await db.query.userStats.findFirst({
        where: eq(schema.userStats.userId, newUser.id),
      });

      if (existingStats) {
        return;
      }

      await db.insert(schema.userStats).values({
        userId: newUser.id,
      });
    }),
  },
});

export type Auth = typeof auth;
