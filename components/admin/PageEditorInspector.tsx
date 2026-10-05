"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import "./page-editor-inspector.css";

type Props = ComponentPropsWithoutRef<"aside"> & {
  open: boolean;
  onClose: () => void;
  label: string;
  breakpoint: number;
};

/** Keep the desktop inspector inline, and the phone editor above its keyboard. */
export default function PageEditorInspector({ open, onClose, label, breakpoint, children, className, ...props }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint]);

  useEffect(() => {
    const element = dialog.current;
    if (!mobile || !open || !element) return;
    // The selected target may live in a preview's separate document.
    let previous = document.activeElement as HTMLElement | null;
    if (previous instanceof HTMLIFrameElement) previous = previous.contentDocument?.activeElement as HTMLElement | null;
    const viewport = window.visualViewport;
    const update = () => {
      element.style.setProperty("--page-editor-visible-height", `${viewport?.height || window.innerHeight}px`);
      element.style.setProperty("--page-editor-visible-top", `${Math.max(0, viewport?.offsetTop || 0)}px`);
    };
    update(); viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update);
    element.showModal();
    element.querySelector<HTMLElement>("input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled),a[href]")?.focus({ preventScroll: true });
    return () => {
      viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update);
      if (element.open) element.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [mobile, open]);

  if (!mobile) return <aside {...props} className={className} aria-label={label}>{children}</aside>;
  return <dialog ref={dialog} className="page-editor-mobile-dialog" aria-label={label}
    onCancel={(event) => { event.preventDefault(); onCloseRef.current(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex='0']"))
        .filter((control) => !control.closest("[inert]") && control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
    <aside {...props} className={`${className ?? ""} page-editor-phone-inspector`} aria-label={label}>{children}</aside>
  </dialog>;
}
