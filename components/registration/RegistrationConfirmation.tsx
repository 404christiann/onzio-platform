"use client";

import { useEffect, useState } from "react";

type Status = "pending" | "paid" | "refunded" | "expired" | "unknown";

function copy(status: Status) {
  switch (status) {
    case "paid":
      return { title: "Registration confirmed", body: "Your registration is complete." };
    case "refunded":
      return { title: "Registration refunded", body: "This registration has been refunded. Contact the club if you need help." };
    case "expired":
      return { title: "Registration expired", body: "This checkout was not completed in time. You can start a new registration." };
    case "unknown":
      return { title: "Registration not found", body: "We could not find that registration. Start again from the registration page." };
    default:
      return { title: "Confirming registration", body: "Your payment is being confirmed. This usually takes a few seconds." };
  }
}

export default function RegistrationConfirmation({ token }: { token: string | null }) {
  const [status, setStatus] = useState<Status>("pending");

  useEffect(() => {
    if (!token) {
      setStatus("unknown");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/register/status?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as { status?: Status };
        if (cancelled) return;
        if (payload.status === "paid" || payload.status === "refunded" || payload.status === "expired") {
          setStatus(payload.status);
          return;
        }
        if (response.status >= 400 && response.status < 500) {
          setStatus("unknown");
          return;
        }
        timer = setTimeout(poll, 2_500);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 4_000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  const content = copy(status);
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
