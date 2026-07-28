"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error(
          "This recovery link is invalid or expired. Request a new link.",
        );
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;

      await supabase.auth.signOut();
      router.replace("/admin/login?password_updated=true");
      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update your password",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0e0e0e] px-6">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a] p-8 text-white">
        <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-red-500">
          Onzio
        </p>
        <h1 className="mt-2 font-display text-3xl font-black uppercase">
          Choose a new password
        </h1>
        <p className="mt-3 text-sm text-white/50">
          Use a unique password. You will sign in and complete MFA afterward.
        </p>

        <form onSubmit={handleUpdate} className="mt-8 space-y-4">
          <label className="block text-sm font-semibold" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-red-500"
          />
          <label
            className="block text-sm font-semibold"
            htmlFor="password-confirmation"
          >
            Confirm new password
          </label>
          <input
            id="password-confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-red-600 py-3 font-display font-black uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-5 text-sm text-red-400">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
