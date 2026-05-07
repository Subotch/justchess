/**
 * Better-Auth catch-all route handler
 * Handles: /api/auth/sign-in, /api/auth/sign-up, /api/auth/sign-out,
 *          /api/auth/session, /api/auth/callback/*, etc.
 */

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
