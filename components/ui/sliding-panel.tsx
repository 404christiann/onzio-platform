"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SlidingPanelDirection = 1 | -1;

type SlidingPanelProps = {
  activeKey: string | number;
  direction: SlidingPanelDirection;
  className?: string;
  children: ReactNode;
};

const variants = {
  enter: (direction: SlidingPanelDirection) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: SlidingPanelDirection) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

function SlidingPanel({
  activeKey,
  direction,
  className,
  children,
}: SlidingPanelProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* mode="popLayout" pops the exiting panel out of normal flow during
          its exit animation, so the entering panel's natural (variable)
          height drives the container instead of a fixed box. */}
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={activeKey}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.15 },
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export { SlidingPanel };
