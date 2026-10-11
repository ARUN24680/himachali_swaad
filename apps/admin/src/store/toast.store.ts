import { create } from 'zustand';

/** Client-only UI state: transient toast messages (never server data). */
export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: 'success' | 'destructive' | 'neutral';
}

interface ToastState {
  toasts: ToastItem[];
  show: (t: Omit<ToastItem, 'id' | 'tone'> & { tone?: ToastItem['tone'] }) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: ({ tone = 'success', ...t }) => set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, tone, id: ++seq }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (t: Parameters<ToastState['show']>[0]) => useToastStore.getState().show(t);
