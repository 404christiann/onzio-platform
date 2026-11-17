"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ADMIN_MOTION_DURATIONS } from "@/lib/admin-motion";
import styles from "./AdminToast.module.css";

type ToastPhase = "enter" | "visible" | "exit";

type ToastView = {
  id: number;
  message: string;
  phase: ToastPhase;
};

type ToastAction = {
  onUndo: () => void;
  onExpire?: () => void;
  expiry: ReturnType<typeof setTimeout>;
};

export type UndoToast = {
  message: string;
  onUndo: () => void;
  onExpire?: () => void;
};

type AdminToastContextValue = {
  showUndo: (toast: UndoToast) => number;
  expireUndo: (id: number) => void;
};

const AdminToastContext = createContext<AdminToastContextValue | null>(null);

export function useAdminToast() {
  const context = useContext(AdminToastContext);
  if (!context) throw new Error("useAdminToast requires AdminToastProvider");
  return context;
}

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastView[]>([]);
  const nextId = useRef(1);
  const actions = useRef(new Map<number, ToastAction>());
  const exitTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(false);

  const dismiss = useCallback((id: number, reason: "undo" | "expire") => {
    const action = actions.current.get(id);
    if (!action) return;
    actions.current.delete(id);
    clearTimeout(action.expiry);
    setToasts((current) => current.map((toast) =>
      toast.id === id ? { ...toast, phase: "exit" } : toast,
    ));
    const exitTimer = setTimeout(() => {
      exitTimers.current.delete(exitTimer);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, ADMIN_MOTION_DURATIONS.toastOut);
    exitTimers.current.add(exitTimer);
    if (reason === "undo") action.onUndo();
    else action.onExpire?.();
  }, []);

  const showUndo = useCallback((toast: UndoToast) => {
    const id = nextId.current++;
    const expiry = setTimeout(() => dismiss(id, "expire"), ADMIN_MOTION_DURATIONS.undoWindow);
    actions.current.set(id, {
      onUndo: toast.onUndo,
      onExpire: toast.onExpire,
      expiry,
    });
    setToasts((current) => [...current, { id, message: toast.message, phase: "enter" }]);
    return id;
  }, [dismiss]);

  useEffect(() => {
    if (!toasts.some((toast) => toast.phase === "enter")) return;
    const frame = requestAnimationFrame(() => {
      setToasts((current) => current.map((toast) =>
        toast.phase === "enter" ? { ...toast, phase: "visible" } : toast,
      ));
    });
    return () => cancelAnimationFrame(frame);
  }, [toasts]);

  useEffect(() => {
    const pendingActions = actions.current;
    const pendingExitTimers = exitTimers.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (mounted.current) return;
        const pending = [...pendingActions.values()];
        pendingActions.clear();
        for (const action of pending) clearTimeout(action.expiry);
        for (const timer of pendingExitTimers) clearTimeout(timer);
        pendingExitTimers.clear();
        const errors: unknown[] = [];
        for (const action of pending) {
          try {
            action.onExpire?.();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) throw new AggregateError(errors, "Undo actions failed during unmount");
      });
    };
  }, []);

  const expireUndo = useCallback((id: number) => dismiss(id, "expire"), [dismiss]);

  return (
    <AdminToastContext.Provider value={{ showUndo, expireUndo }}>
      {children}
      <div className={styles.region} data-admin-toast-region="">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={styles.toast}
            data-phase={toast.phase}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className={styles.message}>{toast.message}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className={styles.undo}
              onClick={() => dismiss(toast.id, "undo")}
              aria-label={`Undo: ${toast.message}`}
            >
              Undo
            </button>
          </div>
        ))}
      </div>
    </AdminToastContext.Provider>
  );
}

