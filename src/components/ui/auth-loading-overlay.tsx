"use client";

/**
 * AuthLoadingOverlay — блокирует интерфейс во время проверки сессии.
 * Показывается пока `isPending === true` из useSession (better-auth).
 */

import { useSession } from "@/lib/auth-client";

export function AuthLoadingOverlay() {
  const { isPending } = useSession();

  if (!isPending) return null;

  return (
    <div
      aria-label="Проверка авторизации"
      role="status"
      className="auth-loading-overlay"
    >
      <div className="auth-loading-spinner">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="auth-loading-dot"
            style={{ "--dot-index": i } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
