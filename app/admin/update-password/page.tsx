"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type RecoveryStep = "checking" | "mfa" | "password" | "error";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [step, setStep] = useState<RecoveryStep>("checking");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function prepareRecovery() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          throw new Error(
            "This recovery session is invalid or expired. Request a new code.",
          );
        }

        const { data: assurance, error: assuranceError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;

        if (
          assurance.currentLevel === "aal2" ||
          assurance.nextLevel !== "aal2"
        ) {
          if (active) setStep("password");
          return;
        }

        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const verifiedFactor = factors.totp.find(
          (factor) => factor.status === "verified",
        );
        if (!verifiedFactor) {
          throw new Error(
            "Your account requires MFA, but no verified authenticator is available. Contact Onzio support.",
          );
        }

        if (active) {
          setFactorId(verifiedFactor.id);
          setStep("mfa");
        }
      } catch (recoveryError) {
        if (active) {
          setStep("error");
          setError(
            recoveryError instanceof Error
              ? recoveryError.message
              : "Unable to verify this recovery session",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void prepareRecovery();
    return () => {
      active = false;
    };
  }, []);

  async function handleMfa(event: FormEvent) {
    event.preventDefault();
    if (!factorId) return;

    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: mfaCode,
      });
      if (verifyError) throw verifyError;

      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== "aal2") {
        throw new Error("MFA verification did not complete. Try again.");
      }

      setMfaCode("");
      setStep("password");
    } catch (mfaError) {
      setError(
        mfaError instanceof Error ? mfaError.message : "MFA verification failed",
      );
    } finally {
      setLoading(false);
    }
  }

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
          "This recovery session is invalid or expired. Request a new code.",
        );
      }

      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (
        assurance.nextLevel === "aal2" &&
        assurance.currentLevel !== "aal2"
      ) {
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const verifiedFactor = factors.totp.find(
          (factor) => factor.status === "verified",
        );
        if (!verifiedFactor) {
          throw new Error(
            "Your account requires MFA, but no verified authenticator is available. Contact Onzio support.",
          );
        }
        setFactorId(verifiedFactor.id);
        setStep("mfa");
        throw new Error(
          "Verify your authenticator code before changing your password.",
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
          {step === "mfa"
            ? "Verify your identity"
            : step === "checking"
              ? "Checking recovery"
              : step === "error"
                ? "Recovery unavailable"
                : "Choose a new password"}
        </h1>
        <p className="mt-3 text-sm text-white/50">
          {step === "mfa"
            ? "Enter the current code from your authenticator app before choosing a new password."
            : step === "checking"
              ? "Confirming your secure recovery session."
              : step === "error"
                ? "Return to sign in and request a new recovery code."
                : "Use a unique password. You will sign in again after updating it."}
        </p>

        {step === "checking" ? (
          <p role="status" className="mt-8 text-sm text-white/60">
            Checking…
          </p>
        ) : step === "mfa" ? (
          <form onSubmit={handleMfa} className="mt-8 space-y-4">
            <label
              className="block text-sm font-semibold"
              htmlFor="recovery-mfa-code"
            >
              Authenticator code
            </label>
            <input
              id="recovery-mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6}"
              maxLength={6}
              value={mfaCode}
              onChange={(event) =>
                setMfaCode(
                  event.target.value.replace(/\D/g, "").slice(0, 6),
                )
              }
              className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-white outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-red-600 py-3 font-display font-black uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify authenticator"}
            </button>
          </form>
        ) : step === "password" ? (
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
        ) : null}

        {error && (
          <p role="alert" className="mt-5 text-sm text-red-400">
            {error}
          </p>
        )}

        {step === "error" && (
          <Link
            href="/admin/login"
            className="mt-6 block text-center text-sm text-white/60 hover:text-white"
          >
            Return to sign in
          </Link>
        )}
      </section>
    </main>
  );
}
