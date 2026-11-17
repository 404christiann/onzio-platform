"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { AdminDialog, AdminDialogFooter } from "@/components/admin/ui/AdminDialog";
import { AdminPendingButton } from "@/components/admin/ui/AdminPendingButton";
import { Button } from "@/components/ui/button";
import {
  UnsavedGuardContext,
  type UnsavedGuardRegistration,
  type UnsavedGuardTarget,
} from "./useUnsavedGuard";

type Attempt = { source: UnsavedGuardRegistration; target: UnsavedGuardTarget };

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function UnsavedGuardProvider({
  children,
  navigate,
}: {
  children: ReactNode;
  navigate: (href: string) => void;
}) {
  const registrations = useRef(new Map<symbol, () => UnsavedGuardRegistration | undefined>());
  const attemptRef = useRef<Attempt | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentDirtyEditor = useCallback(() => {
    for (const read of Array.from(registrations.current.values()).reverse()) {
      const editor = read();
      if (editor?.dirty) return editor;
    }
    return null;
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    attemptRef.current = null;
    setAttempt(null);
    setError(null);
  }, [busy]);

  const requestNavigation = useCallback((target: UnsavedGuardTarget) => {
    if (attemptRef.current) return true;
    const source = currentDirtyEditor();
    if (!source) {
      target.continue();
      return false;
    }

    const next = { source, target };
    openerRef.current = target.opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    attemptRef.current = next;
    setAttempt(next);
    setError(null);
    return true;
  }, [currentDirtyEditor]);

  const context = useMemo(() => ({
    register(read: () => UnsavedGuardRegistration | undefined) {
      const id = Symbol("unsaved editor");
      registrations.current.set(id, read);
      return () => { registrations.current.delete(id); };
    },
    requestNavigation,
  }), [requestNavigation]);

  useEffect(() => {
    function intercept(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === "/api/admin/registrations/export") return;
      if (destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash === window.location.hash) return;
      if (!currentDirtyEditor()) return;

      event.preventDefault();
      requestNavigation({
        kind: "page",
        label: anchor.getAttribute("aria-label")?.trim() || anchor.textContent?.trim() || destination.pathname,
        continue: () => navigate(destination.pathname + destination.search + destination.hash),
        opener: anchor,
      });
    }

    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [currentDirtyEditor, navigate, requestNavigation]);

  async function saveAndContinue() {
    if (!attempt || busy) return;
    setBusy(true);
    setError(null);
    const [saveResult] = await Promise.allSettled([Promise.resolve().then(attempt.source.onSave), wait(700)]);
    if (saveResult.status === "rejected" || saveResult.value !== true) {
      setBusy(false);
      setError("Your changes could not be saved. Try again or keep editing.");
      return;
    }
    attemptRef.current = null;
    setAttempt(null);
    setBusy(false);
    attempt.target.continue();
  }

  async function discardAndContinue() {
    if (!attempt || busy) return;
    setBusy(true);
    setError(null);
    try {
      await attempt.source.onDiscard?.();
    } catch {
      setBusy(false);
      setError("Your changes could not be discarded. Try again or keep editing.");
      return;
    }
    attemptRef.current = null;
    setAttempt(null);
    setBusy(false);
    attempt.target.continue();
  }

  const retentionNotice = attempt?.source.retentionNotice?.() ?? null;
  const retentionId = `${descriptionId}-retention`;

  return (
    <UnsavedGuardContext.Provider value={context}>
      {children}
      <AdminDialog
        open={attempt !== null}
        onClose={close}
        title="Save your changes first?"
        size="md"
        busy={busy}
        initialFocus={saveRef}
        finalFocus={openerRef}
        descriptionId={retentionNotice ? `${descriptionId} ${retentionId}` : descriptionId}
        footer={(
          <AdminDialogFooter
            actionsClassName="flex-1 min-w-0"
            primary={(
              <AdminPendingButton
                ref={saveRef}
                variant="default"
                size="lg"
                className="min-h-11"
                label={attempt?.target.kind === "switch" ? "Save and switch" : "Save and leave"}
                pendingLabel="Saving…"
                pending={busy}
                onClick={() => void saveAndContinue()}
              />
            )}
            destructive={(
              <Button
                type="button"
                variant="outline"
                className="min-h-11 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => void discardAndContinue()}
              >
                Discard changes
              </Button>
            )}
          >
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={close}>
              Keep editing
            </Button>
          </AdminDialogFooter>
        )}
      >
        <p id={descriptionId} className="text-sm leading-6 text-muted-foreground">
          You edited <strong className="font-semibold text-foreground">{attempt?.source.edited}</strong>.{" "}
          {attempt?.target.kind === "switch" ? "Switching to " : "Leaving for "}
          <strong className="font-semibold text-foreground">{attempt?.target.label}</strong>{" "}
          will lose those changes unless you save them.
        </p>
        {retentionNotice && <p id={retentionId} className="text-sm leading-6 text-muted-foreground">{retentionNotice}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </AdminDialog>
    </UnsavedGuardContext.Provider>
  );
}

export function ClassicAdminUnsavedGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const navigate = useCallback((href: string) => router.push(href), [router]);
  return <UnsavedGuardProvider navigate={navigate}>{children}</UnsavedGuardProvider>;
}

