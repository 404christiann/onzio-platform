"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

export function EditorialDialogRoot(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

export function EditorialDialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function EditorialDialogPortal({
  className,
  ...props
}: DialogPrimitive.Portal.Props & { className?: string }) {
  return <DialogPrimitive.Portal className={cn(className)} {...props} />;
}

export function EditorialDialogBackdrop({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn("fixed inset-0 z-40 bg-ed-ink/70 backdrop-blur-sm", className)}
      {...props}
    />
  );
}

export function EditorialDialogPopup({
  className,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Popup
      className={cn(
        "fixed inset-x-4 top-4 z-50 max-h-[calc(100dvh-2rem)] overflow-auto bg-ed-paper p-6 text-ed-ink shadow-[0_30px_90px_rgba(0,0,0,0.32)] outline-none md:inset-x-auto md:left-1/2 md:top-6 md:w-[min(560px,calc(100vw-3rem))] md:-translate-x-1/2",
        className,
      )}
      {...props}
    />
  );
}

export function EditorialDialogTitle(props: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title {...props} />;
}

export function EditorialDialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close {...props} />;
}
