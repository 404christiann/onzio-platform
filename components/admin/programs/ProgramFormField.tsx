"use client";
import { Children, cloneElement, isValidElement, useId, type ReactNode } from "react";
import type { ProgramValidationErrors } from "@/lib/program-admin";
import { ADMIN_LABEL_CLASS } from "@/components/admin/form-styles";

export function FormField({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={ADMIN_LABEL_CLASS}>{label}</span>
      {children}
      {error}
    </label>
  );
}

export function fieldError(errors: ProgramValidationErrors, field: keyof ProgramValidationErrors) {
  const message = errors[field];
  return message ? (
    <p className="mt-1.5 font-body text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}



export function ClassicFormField({ label, children, error }: { label: string; children: ReactNode; error?: ReactNode }) {
  const id = useId();
  const errorId = id + "-error";
  return <div className="classic-programs-field">
    <label className="classic-programs-label" htmlFor={id}>{label}</label>
    {Children.map(children, child => isValidElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false"; "aria-required"?: boolean }>(child)
      ? cloneElement(child, {
        id,
        "aria-describedby": [child.props["aria-describedby"], error ? errorId : null].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : child.props["aria-invalid"],
        "aria-required": label === "Display title" || label === "Slug" || undefined,
      }) : child)}
    {error && <div id={errorId}>{error}</div>}
  </div>;
}
