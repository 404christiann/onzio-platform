"use client";

import { useState } from "react";
import RegisterModal from "@/components/registration/RegisterModal";
import type { PublicRegistrationForm } from "@/lib/registration-public";

type Props = {
  form: PublicRegistrationForm;
  label?: string;
  className?: string;
};

/** A tenant-neutral CTA that owns the registration modal's client interaction. */
export default function RegistrationCtaButton({
  form,
  label = "Register now",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-red)] px-5 font-display text-sm font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90 ${className}`}>
        {label}
      </button>
      <RegisterModal form={form} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
