"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const MIN_RECOVERY_CODE_LENGTH = 6;
const MAX_RECOVERY_CODE_LENGTH = 10;

export default function RecoverPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: verificationError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "recovery",
      });
      if (verificationError) throw verificationError;

      router.replace("/admin/update-password");
      router.refresh();
    } catch {
      setError(
        "That recovery code is invalid or expired. Request a new code and enter only the newest one.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0e0e0e] px-6 py-8">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a] p-8 text-white">
        <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-red-500">
          Onzio
        </p>
        <h1 className="mt-2 font-display text-3xl font-black uppercase">
          Enter recovery code
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/50">
          Enter the administrator email and the recovery code from the newest
          password-reset email.
        </p>

        <form onSubmit={handleVerify} className="mt-8 space-y-4">
          <label className="block text-sm font-semibold" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-red-500"
          />

          <label
            className="block text-sm font-semibold"
            htmlFor="recovery-code"
          >
            Recovery code
          </label>
          <input
            id="recovery-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern={`[0-9]{${MIN_RECOVERY_CODE_LENGTH},${MAX_RECOVERY_CODE_LENGTH}}`}
            minLength={MIN_RECOVERY_CODE_LENGTH}
            maxLength={MAX_RECOVERY_CODE_LENGTH}
            value={token}
            onChange={(event) =>
              setToken(
                event.target.value
                  .replace(/\D/g, "")
                  .slice(0, MAX_RECOVERY_CODE_LENGTH),
              )
            }
            className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-white outline-none focus:border-red-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-red-600 py-3 font-display font-black uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Continue"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-5 text-sm text-red-400">
            {error}
          </p>
        )}

        <Link
          href="/admin/login"
          className="mt-6 block text-center text-sm text-white/60 hover:text-white"
        >
          Request a new code
        </Link>
      </section>
    </main>
  );
}
