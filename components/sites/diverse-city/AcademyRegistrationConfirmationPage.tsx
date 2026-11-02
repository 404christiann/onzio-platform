"use client";

import { useRegistrationConfirmation } from "@/components/registration/RegistrationConfirmation";

export default function AcademyRegistrationConfirmationPage({ token }: { token: string | null }) {
  const { status, content } = useRegistrationConfirmation(token);
  return (
    <section className="mx-auto flex min-h-[58vh] max-w-2xl items-center px-5 py-16 sm:px-8">
      <div className="w-full border-l-4 border-[var(--color-red)] bg-white px-6 py-8 shadow-sm sm:px-9">
        <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-red)]">Registration</p>
        <h1 className="mt-2 font-display text-4xl font-black uppercase leading-none text-[var(--color-black)]">{content.title}</h1>
        <p className="mt-5 max-w-xl font-body text-base leading-relaxed text-black/70">{content.body}</p>
        {status === "pending" && <div aria-label="Confirmation pending" className="mt-6 h-1.5 w-24 overflow-hidden bg-black/10"><div className="h-full w-1/2 animate-pulse bg-[var(--color-red)]" /></div>}
      </div>
    </section>
  );
}
