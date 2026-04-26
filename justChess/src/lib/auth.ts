/**
 * Better-Auth configuration
 * Docs: https://www.better-auth.com/docs
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

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
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // refresh if older than 1 day
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

  // Trusted origins for CORS
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ],

  // Hooks — run after user creation to seed stats
  hooks: {
    after: [
      {
        matcher: (context) => context.path === "/sign-up/email",
        handler: async (context) => {
          // Seed user_stats row after registration
          const userId = (context.context as any)?.newSession?.userId;
          if (userId) {
            try {
              const { userStats } = await import("@/db/schema");
              const { db: database } = await import("@/db");
              await database.insert(userStats).values({ userId }).onConflictDoNothing();
            } catch (e) {
              console.error("Failed to seed user stats:", e);
            }
          }
        },
      },
    ],
  },
});

export type Auth = typeof auth;
