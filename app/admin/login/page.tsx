"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createAuthEmailCallbackUrl } from "@/lib/auth-email-callback";
import { createClient } from "@/lib/supabase-browser";
import ResilientNativeImage from "@/components/ResilientNativeImage";

type MfaStep = {
  factorId: string;
  qrCode?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfa, setMfa] = useState<MfaStep | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reason = searchParams.get("error");
    if (reason === "mfa_required") {
      setError("Enter your password, then complete MFA to continue.");
    } else if (reason === "not_authorized") {
      setError("This account is not an active administrator for this club.");
    } else if (reason === "invalid_auth_link") {
      setError(
        "This invitation or recovery link is invalid or expired. Request a new link.",
      );
    }
  }, [searchParams]);

  async function beginMfa() {
    const supabase = createClient();
    const { data: assurance } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel === "aal2") {
      router.replace("/admin");
      router.refresh();
      return;
    }

    const { data: factors, error: factorsError } =
      await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const verified = factors.totp.find(
      (factor) => factor.status === "verified",
    );
    if (verified) {
      setMfa({ factorId: verified.id });
      return;
    }

    const { data: enrollment, error: enrollmentError } =
      await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Onzio Admin",
      });
    if (enrollmentError) throw enrollmentError;
    setMfa({
      factorId: enrollment.id,
      qrCode: enrollment.totp.qr_code,
    });
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      await beginMfa();
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : "Unable to sign in",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRecovery(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const redirectTo = createAuthEmailCallbackUrl(window.location.origin);
      const { error: recoveryError } =
        await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (recoveryError) throw recoveryError;
      setRecoverySent(true);
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "Unable to send a password recovery email",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(event: FormEvent) {
    event.preventDefault();
    if (!mfa) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: mfa.factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfa.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      router.replace("/admin");
      router.refresh();
    } catch (mfaError) {
      setError(
        mfaError instanceof Error ? mfaError.message : "MFA verification failed",
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
          Admin Portal
        </h1>
        <p className="mt-3 text-sm text-white/50">
          Password authentication and MFA are required for every administrator.
        </p>

        {mfa ? (
          <form onSubmit={handleMfa} className="mt-8 space-y-4">
            {mfa.qrCode && (
              <div className="rounded-xl bg-white p-4 text-center">
                {/* Supabase returns a local data URI for this enrollment QR. */}
                <ResilientNativeImage
                  src={mfa.qrCode}
                  alt="Scan this MFA enrollment code"
                  className="mx-auto h-48 w-48"
                  fallbackVariant="logo"
                />
                <p className="mt-3 text-xs text-black/70">
                  Scan once with your authenticator app, then enter its code.
                </p>
              </div>
            )}
            <label className="block text-sm font-semibold" htmlFor="mfa-code">
              Authenticator code
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-red-600 py-3 font-display font-black uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify MFA"}
            </button>
          </form>
        ) : recoveryMode ? (
          recoverySent ? (
            <div className="mt-8 space-y-5">
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                Check your email for a recovery code, then enter it on the
                secure recovery page.
              </p>
              <Link
                href="/admin/recover"
                className="block w-full rounded-lg bg-red-600 py-3 text-center font-display text-sm font-black uppercase tracking-widest"
              >
                Enter recovery code
              </Link>
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(false);
                  setRecoverySent(false);
                  setError(null);
                }}
                className="w-full rounded-lg border border-white/15 py-3 font-display text-sm font-bold uppercase tracking-widest"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleRecovery} className="mt-8 space-y-4">
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
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-red-600 py-3 font-display font-black uppercase tracking-widest disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(false);
                  setError(null);
                }}
                className="w-full py-2 text-sm text-white/60 hover:text-white"
              >
                Back to sign in
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleLogin} className="mt-8 space-y-4">
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
            <label className="block text-sm font-semibold" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-red-600 py-3 font-display font-black uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRecoveryMode(true);
                setError(null);
              }}
              className="w-full py-2 text-sm text-white/60 hover:text-white"
            >
              Forgot your password?
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-5 text-sm text-red-400">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
