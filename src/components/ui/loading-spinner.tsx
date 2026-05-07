"use client";

/**
 * LoadingSpinner — переиспользуемый спиннер с анимацией из AuthLoadingOverlay.
 * Варианты:
 *   - fullscreen: overlay на весь экран (как при авторизации)
 *   - inline: вписывается в контент без overlay
 */

interface LoadingSpinnerProps {
  /** Если true — рендерит полноэкранный overlay как при авторизации */
  fullscreen?: boolean;
  /** Дополнительные классы для контейнера (только inline режим) */
  className?: string;
}

export function LoadingSpinner({ fullscreen = false, className }: LoadingSpinnerProps) {
  const spinner = (
    <div className="auth-loading-spinner">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="auth-loading-dot"
          style={{ "--dot-index": i } as React.CSSProperties}
        />
      ))}
    </div>
  );

  if (fullscreen) {
    return (
      <div
        aria-label="Загрузка"
        role="status"
        className="auth-loading-overlay"
      >
        {spinner}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Загрузка"
      className={`flex items-center justify-center py-8 ${className ?? ""}`}
    >
      {spinner}
    </div>
  );
}
