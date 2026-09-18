'use client';
import { useCallback, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';
export type ToastTone = 'info' | 'success' | 'error' | 'gold';
export type Toast = { id: number; text: string; tone: ToastTone; ms: number };
const icons: Record<ToastTone, IconName> = { info: 'info', success: 'check', error: 'alert', gold: 'coin' };
// Small toast queue: newest at the bottom, at most three visible, auto-dismissing.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((text: string, tone: ToastTone = 'info', ms = 5000) => {
    const id = next.current++;
    setToasts((list) => [...list.slice(-2), { id, text, tone, ms }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), ms);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  return { toasts, push, dismiss };
}
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button type="button" key={t.id} className={`toast ${t.tone}`} style={{ ['--toast-ms' as string]: `${t.ms}ms` }} onClick={() => onDismiss(t.id)} aria-label={`${t.text}. Dismiss`}>
          <Icon name={icons[t.tone]} />
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}
