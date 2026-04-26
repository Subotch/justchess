/**
 * Helpers for consistent API responses
 */

import { NextResponse } from "next/server";
import type { ApiError, ApiSuccess } from "@/types/api";

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

export function err(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, string[]>
): NextResponse<ApiError> {
  return NextResponse.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

export const Errors = {
  unauthorized: () => err("UNAUTHORIZED", "Authentication required", 401),
  forbidden: () => err("FORBIDDEN", "You do not have permission", 403),
  notFound: (resource = "Resource") =>
    err("NOT_FOUND", `${resource} not found`, 404),
  conflict: (message: string) => err("CONFLICT", message, 409),
  badRequest: (message: string, details?: Record<string, string[]>) =>
    err("BAD_REQUEST", message, 400, details),
  internal: () =>
    err("INTERNAL_ERROR", "An unexpected error occurred", 500),
  rateLimited: () =>
    err("RATE_LIMITED", "Too many requests. Please slow down.", 429),
};
