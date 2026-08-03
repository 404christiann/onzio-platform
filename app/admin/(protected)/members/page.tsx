"use client";

import { FormEvent, useEffect, useState } from "react";

type AdminMember = { userId: string; email: string };

function membershipErrorMessage(code: unknown, fallback: string) {
  if (code === "AUTH_CODE_RATE_LIMITED") {
    return "A sign-in code was sent recently. Wait one minute, then try adding this administrator again.";
  }
  if (code === "AUTH_CODE_DELIVERY_FAILED") {
    return "We couldn't send a sign-in code. The administrator was not added; please try again.";
  }
  return fallback;
}

export default function MembersPage() {
  const [admins, setAdmins] = useState<AdminMember[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/members", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load administrators");
    setAdmins(body.admins);
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error.message));
  }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", email }),
    });
    const body = await response.json();
    if (!response.ok) {
      return setMessage(
        membershipErrorMessage(body.error, "Unable to add administrator"),
      );
    }
    setEmail("");
    setMessage("Administrator added. A sign-in code was sent to their email.");
    await load();
  }

  async function remove(userId: string) {
    setMessage(null);
    const response = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", userId }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error ?? "Unable to remove administrator");
    setMessage("Administrator access removed.");
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl text-white">
      <h1 className="font-display text-4xl font-black uppercase">Team access</h1>
      <p className="mt-2 text-sm text-white/50">
        Owners can add or remove administrators. Ownership changes still require Onzio.
      </p>

      <form onSubmit={add} className="mt-8 rounded-xl border border-white/10 bg-[#141414] p-5">
        <h2 className="font-display text-xl font-black uppercase">Add administrator</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="administrator@example.com"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-4 py-3 outline-none focus:border-red-500"
          />
          <button className="rounded-lg bg-red-600 px-5 py-3 font-display font-black uppercase">
            Send access code
          </button>
        </div>
      </form>

      <section className="mt-6 space-y-3">
        {admins.map((admin) => (
          <div key={admin.userId} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#141414] p-4">
            <span className="min-w-0 truncate text-sm">{admin.email}</span>
            <button
              type="button"
              onClick={() => void remove(admin.userId)}
              className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-bold uppercase text-red-300"
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      {message && <p role="status" className="mt-5 text-sm text-white/65">{message}</p>}
    </div>
  );
}
