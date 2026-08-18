"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import PathwayTrainingGateway from "@/components/pathway/PathwayTrainingGateway";

type TrainingGatewayContextValue = {
  openTrainingGateway: (trigger: HTMLElement) => void;
};

const TrainingGatewayContext = createContext<TrainingGatewayContextValue | null>(
  null,
);

export function usePathwayTrainingGateway() {
  const context = useContext(TrainingGatewayContext);
  if (!context) {
    throw new Error(
      "usePathwayTrainingGateway must be used inside PathwayTrainingGatewayProvider",
    );
  }
  return context;
}

export default function PathwayTrainingGatewayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openTrainingGateway = useCallback((trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setInstance((value) => value + 1);
    setIsOpen(true);
  }, []);

  const closeTrainingGateway = useCallback(() => {
    setIsOpen(false);
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => headingRef.current?.focus());
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        if (triggerRef.current?.isConnected) triggerRef.current.focus();
      });
    };
  }, [isOpen]);

  return (
    <TrainingGatewayContext.Provider value={{ openTrainingGateway }}>
      {children}
      <dialog
        ref={dialogRef}
        className="pathway-training-dialog"
        role="dialog"
        aria-labelledby="pathway-training-dialog-title"
        aria-modal="true"
        onCancel={(event) => {
          event.preventDefault();
          closeTrainingGateway();
        }}
        onClose={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          if (window.matchMedia("(min-width: 721px)").matches) {
            closeTrainingGateway();
          }
        }}
      >
        <PathwayTrainingGateway
          key={instance}
          mode="dialog"
          headingId="pathway-training-dialog-title"
          headingRef={headingRef}
          onClose={closeTrainingGateway}
        />
      </dialog>
    </TrainingGatewayContext.Provider>
  );
}
