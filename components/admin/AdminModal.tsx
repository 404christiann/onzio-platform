"use client";

import { Dialog } from "@base-ui/react/dialog";
import { forwardRef, useEffect, useState, type ReactNode, type CSSProperties } from "react";

/** Keep modal focus management in one established primitive and retain the
 * protected shell's theme, safe-area variables and typography in its portal. */
export const AdminModal = forwardRef<HTMLDivElement, {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className: string;
  style?: CSSProperties;
  backdropClassName?: string;
  id?: string;
  "data-slot"?: string;
  "data-state"?: string;
  "data-size"?: string;
  "aria-busy"?: boolean;
  inert?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  initialFocus?: Dialog.Popup.Props["initialFocus"];
  finalFocus?: Dialog.Popup.Props["finalFocus"];
  backdropSlot?: string;
  busy?: boolean;
  dismissOnEscape?: boolean;
  dismissOnBackdrop?: boolean;
}>(function AdminModal({ open, onClose, children, className, backdropClassName,
  initialFocus, finalFocus, backdropSlot, busy = false, dismissOnEscape = true,
  dismissOnBackdrop = true, ...labels }, ref) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => { setContainer(document.querySelector<HTMLElement>(".admin-portal")); }, []);
  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal={busy || !dismissOnBackdrop}
      onOpenChange={(nextOpen, details) => {
        if (nextOpen) return;
        if (busy || (!dismissOnEscape && details.reason === "escape-key")) {
          details.cancel();
          return;
        }
        onClose();
      }}
    >
      <Dialog.Portal container={container}>
        <Dialog.Backdrop data-slot={backdropSlot} className={backdropClassName ?? "fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[1px]"} />
        <Dialog.Popup ref={ref} initialFocus={initialFocus} finalFocus={finalFocus} className={className} {...labels}>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
