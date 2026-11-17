import type { ComponentPropsWithoutRef, ReactNode } from "react";

import guided from "@/components/admin/AdminGuided.module.css";
import frame from "./AdminPage.module.css";

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
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function AdminPageHeader({
  title,
  description,
  eyebrow,
  breadcrumb,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <header className={cn(frame.header, guided.pageHeader, className)} data-admin-page-header="">
      <div className={frame.heading}>
        <div className={frame.breadcrumb} data-admin-page-breadcrumb="">
          {breadcrumb ?? eyebrow ?? "Club admin"}
        </div>
        <h1 className={frame.title}>{title}</h1>
        {description && <p className={frame.description}>{description}</p>}
      </div>
      {actions && <div className={frame.actions} data-admin-page-actions="">{actions}</div>}
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
        guided.panel,
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
        guided.toolbar,
        className,
      )}
      {...props}
    />
  );
}
