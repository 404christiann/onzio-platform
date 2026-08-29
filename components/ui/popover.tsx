"use client";

import { useEffect, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/**
 * By default, Base UI's `Popover.Portal` renders into `document.body`, which
 * is a *sibling* of the `.admin-theme` wrapper div (see
 * `components/admin/AdminThemeProvider.tsx`), not a descendant of it. All of
 * this app's theme tokens (`--popover`, etc.) are scoped to
 * `.admin-theme[data-admin-theme="…"]` in `styles/globals.css`, so anything
 * portaled straight to `document.body` loses every themed CSS variable and
 * renders with transparent/invalid colors (e.g. `bg-popover` resolving to
 * nothing). Default the portal container to the nearest `.admin-theme`
 * wrapper on the page so portaled content stays inside the themed subtree;
 * callers can still override via the `portal` prop when truly needed.
 */
function useDefaultPopoverPortalContainer() {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(
      document.querySelector<HTMLElement>(".admin-theme") ?? document.body
    );
  }, []);

  return container;
}

function PopoverPositioner({
  sideOffset = 4,
  portal,
  className,
  ...props
}: PopoverPrimitive.Positioner.Props & {
  portal?: PopoverPrimitive.Portal.Props;
}) {
  const defaultContainer = useDefaultPopoverPortalContainer();

  return (
    <PopoverPrimitive.Portal container={defaultContainer} {...portal}>
      <PopoverPrimitive.Positioner
        data-slot="popover-positioner"
        sideOffset={sideOffset}
        className={cn("z-50", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverContent({ className, ...props }: PopoverPrimitive.Popup.Props) {
  return (
    <PopoverPrimitive.Popup
      data-slot="popover-content"
      className={cn(
        "bg-popover text-popover-foreground data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-[var(--transform-origin)] rounded-md border p-4 shadow-md outline-none",
        className
      )}
      {...props}
    />
  );
}

function PopoverAnchor({ ...props }: PopoverPrimitive.Arrow.Props) {
  return <PopoverPrimitive.Arrow data-slot="popover-anchor" {...props} />;
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverPositioner,
};
