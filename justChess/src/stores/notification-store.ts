/**
 * useNotificationStore — toast notifications and achievement popups
 */

"use client";

import { create } from "zustand";

export type NotificationType = "success" | "error" | "info" | "warning" | "achievement";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // ms, default 4000
  iconUrl?: string;  // for achievements
}

interface NotificationStore {
  notifications: Notification[];
  add: (notification: Omit<Notification, "id">) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  add: (notification) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const duration = notification.duration ?? 4000;

    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }));

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, duration);
    }
  },

  remove: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clear: () => set({ notifications: [] }),
}));

// Convenience helpers
export const notify = {
  success: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: "success", title, message }),
  error: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: "error", title, message, duration: 6000 }),
  info: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: "info", title, message }),
  warning: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: "warning", title, message }),
  achievement: (title: string, message: string, iconUrl?: string) =>
    useNotificationStore.getState().add({
      type: "achievement",
      title,
      message,
      iconUrl,
      duration: 6000,
    }),
};
