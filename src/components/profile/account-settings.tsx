"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { clsx } from "clsx";
import { useTranslation } from "@/lib/i18n";
import { useSession } from "@/lib/auth-client";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getFieldError(err: unknown, t: (key: string) => string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Incorrect")) return t("profile.incorrectPassword");
  if (msg.includes("already") || msg.includes("taken")) return t("profile.usernameTaken");
  return msg;
}

// ─────────────────────────────────────────────
// Single field edit (name / username / email)
// ─────────────────────────────────────────────

interface AccountFieldProps {
  label: string;
  currentValue: string;
  fieldName: "name" | "username" | "email";
  placeholder?: string;
  maxLength?: number;
  onSave: (fieldName: "name" | "username" | "email", value: string, currentPassword: string) => Promise<void>;
}

function AccountField({ label, currentValue, fieldName, placeholder, maxLength, onSave }: AccountFieldProps) {
  const { t } = useTranslation();
  const [editMode, setEditMode] = useState(false);
  const [value, setValue] = useState(currentValue);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  const handleSave = () => {
    if (!password.trim()) {
      setError(t("profile.incorrectPassword"));
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await onSave(fieldName, value, password);
        setSuccess(true);
        setEditMode(false);
        setPassword("");
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(getFieldError(err, t));
      }
    });
  };

  const handleCancel = () => {
    setEditMode(false);
    setValue(currentValue);
    setPassword("");
    setError("");
  };

  if (!editMode) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-[var(--border)]">
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
          <p className="text-sm text-[var(--muted)]">{currentValue || "—"}</p>
        </div>
        <button
          onClick={() => setEditMode(true)}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          {t("profile.editProfile")}
        </button>
    </div>
  );
}


  return (
    <div className="py-3 border-b border-[var(--border)] space-y-2">
      <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
      <input
        type={fieldName === "email" ? "email" : "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t("profile.currentPassword")}
        className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-green-500">{t("profile.settingsSaved")}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "..." : t("profile.save")}
        </button>
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)]"
        >
          {t("profile.cancel")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Password change form
// ─────────────────────────────────────────────

function PasswordForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  const handleSave = () => {
    if (newPassword.length < 8) { setError(t("profile.passwordTooShort")); return; }
    if (newPassword !== confirmPassword) { setError(t("profile.passwordMismatch")); return; }
    setError("");
    startTransition(async () => {
      try {
        const res = await fetch(`/api/users/${session!.user.id}/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "changePassword", currentPassword, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Failed");
        setSuccess(true);
        setTimeout(onClose, 1500);
      } catch (err) {
        setError(getFieldError(err, t));
      }
    });
  };

  return (
    <div className="py-3 border-b border-[var(--border)] space-y-2">
      <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder={t("profile.currentPassword")}
        className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]" />
      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
        placeholder={t("profile.newPassword")}
        className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]" />
      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder={t("profile.confirmNewPassword")}
        className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)]" />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-green-500">{t("profile.settingsSaved")}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={isPending}
          className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50">
          {isPending ? "..." : t("profile.save")}
        </button>
        <button onClick={onClose}
          className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)]">
          {t("profile.cancel")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Bio form (no password required)
// ─────────────────────────────────────────────

function BioForm({ currentBio, onSave }: { currentBio: string | null; onSave: (bio: string) => void }) {
  const { t } = useTranslation();
  const [editMode, setEditMode] = useState(false);
  const [value, setValue] = useState(currentBio ?? "");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  const handleSave = () => {
    startTransition(async () => {
      await onSave(value);
      setSuccess(true);
      setEditMode(false);
      setTimeout(() => setSuccess(false), 3000);
    });
  };

  return (
    <div className="py-3 border-b border-[var(--border)] space-y-2">
      <p className="text-sm font-medium text-[var(--foreground)]">{t("profile.changeBio")}</p>
      {editMode ? (
        <>
          <textarea value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={t("profile.bioPlaceholder")} maxLength={500} rows={3}
            className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none" />
          <p className="text-xs text-[var(--muted)]">{value.length}/500</p>
          {success && <p className="text-xs text-green-500">{t("profile.settingsSaved")}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={isPending}
              className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50">
              {isPending ? "..." : t("profile.save")}
            </button>
            <button onClick={() => { setEditMode(false); setValue(currentBio ?? ""); }}
              className="px-3 py-1.5 text-sm rounded border border-[var(--border)] hover:bg-[var(--bg-secondary)]">
              {t("profile.cancel")}
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-[var(--muted)] whitespace-pre-wrap">{currentBio || t("profile.noBio")}</p>
          <button onClick={() => setEditMode(true)} className="text-sm text-[var(--accent)] hover:underline shrink-0">
            {t("profile.editProfile")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Theme selector
// ─────────────────────────────────────────────

function ThemeSelector() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="py-3 border-b border-[var(--border)]">
      <p className="text-sm font-medium text-[var(--foreground)] mb-2">{t("profile.themeLabel")}</p>
      <div className="flex gap-2">
        {(["light", "dark", "system"] as const).map((v) => (
          <button key={v} onClick={() => setTheme(v)}
            className={clsx("px-3 py-1.5 text-sm rounded border transition-colors",
              theme === v ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "border-[var(--border)] hover:bg-[var(--bg-secondary)]")}>
            {t(`profile.${v}Theme`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Language selector
// ─────────────────────────────────────────────

function LanguageSelector() {
  const { t, locale, setLocale } = useTranslation();

  return (
    <div className="py-3 border-b border-[var(--border)]">
      <p className="text-sm font-medium text-[var(--foreground)] mb-2">{t("profile.languageLabel")}</p>
      <div className="flex gap-2">
        {(["en", "ru"] as const).map((lang) => (
          <button key={lang} onClick={() => setLocale(lang)}
            className={clsx("px-3 py-1.5 text-sm rounded border transition-colors",
              locale === lang ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "border-[var(--border)] hover:bg-[var(--bg-secondary)]")}>
            {lang === "en" ? "English" : "Русский"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

interface AccountSettingsProps {
  user: {
    name: string;
    username: string | null;
    email: string;
    bio: string | null;
  };
}

export function AccountSettings({ user }: AccountSettingsProps) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const handleFieldSave = async (
    fieldName: "name" | "username" | "email",
    value: string,
    currentPassword: string
  ) => {
    if (!session?.user) throw new Error("Not authenticated");
    const actionMap = { name: "changeName", username: "changeUsername", email: "changeEmail" } as const;
    const body: Record<string, string> = { action: actionMap[fieldName], currentPassword };
    if (fieldName === "name") body.newName = value;
    if (fieldName === "username") body.newUsername = value;
    if (fieldName === "email") body.newEmail = value;

    const res = await fetch(`/api/users/${session.user.id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "Failed");
  };

  const handleBioSave = async (bio: string) => {
    if (!session?.user) return;
    await fetch(`/api/users/${session.user.id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "changeBio", newBio: bio }),
    });
  };

  return (
    <div className="space-y-6">
      {/* Appearance */}
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">{t("profile.appearance")}</h3>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <ThemeSelector />
          <LanguageSelector />
        </div>
      </div>

      {/* Personal info */}
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">{t("profile.personalInfo")}</h3>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <AccountField label={t("profile.changeName")} currentValue={user.name} fieldName="name" maxLength={100} onSave={handleFieldSave} />
          <AccountField label={t("profile.changeUsername")} currentValue={user.username ?? ""} fieldName="username" placeholder="your_username" maxLength={30} onSave={handleFieldSave} />
          <AccountField label={t("profile.changeEmail")} currentValue={user.email} fieldName="email" placeholder="your@email.com" onSave={handleFieldSave} />
          <BioForm currentBio={user.bio} onSave={handleBioSave} />
        </div>
      </div>

      {/* Security */}
      <div>
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">{t("profile.security")}</h3>
        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          {!showPasswordForm ? (
            <div className="flex items-center justify-between py-3 px-4">
              <p className="text-sm text-[var(--muted)]">{t("profile.changePassword")}</p>
              <button onClick={() => setShowPasswordForm(true)} className="text-sm text-[var(--accent)] hover:underline">
                {t("profile.editProfile")}
              </button>
            </div>
          ) : (
            <PasswordForm onClose={() => setShowPasswordForm(false)} />
          )}
        </div>
      </div>
    </div>
  );
}
