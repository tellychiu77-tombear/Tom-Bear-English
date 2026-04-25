'use client';
import { useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastState {
  msg: string;
  type: ToastType;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return { toast, showToast };
}

// Toast CSS classes by type
export const TOAST_CLASSES: Record<ToastType, string> = {
  success: 'bg-green-500',
  error:   'bg-red-500',
  info:    'bg-indigo-500',
};
