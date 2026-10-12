"use client";

import { Dialog } from "@base-ui/react/dialog";
import { forwardRef, useEffect, useState, type ReactNode, type RefObject, type CSSProperties } from "react";

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
  "aria-label"?: string;
  "aria-labelledby"?: string;
  initialFocus?: RefObject<HTMLElement | null>;
}>(function AdminModal({ open, onClose, children, className, backdropClassName,
  initialFocus, ...labels }, ref) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => { setContainer(document.querySelector<HTMLElement>(".admin-portal")); }, []);
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className={backdropClassName ?? "fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[1px]"} />
        <Dialog.Popup ref={ref} initialFocus={initialFocus} className={className} {...labels}>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
