import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminPageProps = ComponentPropsWithoutRef<"div">;

export function AdminPage({ className, ...props }: AdminPageProps) {
  return (
    <div
      className={cn("mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6", className)}
      {...props}
    />
  );
}

type AdminPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function AdminPageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1
          className={cn(
            "text-2xl font-semibold normal-case leading-tight tracking-tight text-foreground sm:text-3xl",
            eyebrow && "mt-2",
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type AdminPanelProps = ComponentPropsWithoutRef<"section"> & {
  as?: "section" | "aside" | "div";
};

export function AdminPanel({
  as: Component = "section",
  className,
  ...props
}: AdminPanelProps) {
  return (
    <Component
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

type AdminPageToolbarProps = ComponentPropsWithoutRef<"div">;

export function AdminPageToolbar({ className, ...props }: AdminPageToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5",
        className,
      )}
      {...props}
    />
  );
}
