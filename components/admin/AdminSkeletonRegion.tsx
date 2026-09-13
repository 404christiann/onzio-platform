import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A named loading section. Its placeholder shapes are purely decorative. */
export function AdminSkeletonRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-label={label} className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}
