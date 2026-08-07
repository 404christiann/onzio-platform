"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type LoginStep = "email" | "code" | "unknown";

const UNKNOWN_ADDRESS_ERROR = "Signups not allowed for otp";
const UNKNOWN_ADDRESS_INTRO = "We couldn't find an Onzio account for";
const EMAIL_COOLDOWN_ERROR = "over_email_send_rate_limit";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<LoginStep>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSubmittedCode = useRef<string | null>(null);

  useEffect(() => {
    const reason = searchParams.get("error");
    if (reason === "session_expired") {
      setError("Your Onzio session expired. Request a new code to continue.");
    } else if (reason === "not_authorized") {
      setError("This account is not an active administrator for this club.");
    } else if (reason === "invalid_auth_link") {
      setError("That sign-in link is invalid or expired. Request a new code.");
    }
  }, [searchParams]);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: requestError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (requestError) {
        if (requestError.message.includes(UNKNOWN_ADDRESS_ERROR)) {
          setStep("unknown");
          return;
        }
        if (requestError.code === EMAIL_COOLDOWN_ERROR) {
          setCode("");
          lastSubmittedCode.current = null;
          setStep("code");
          setError(
            "A sign-in code was sent recently. Enter the code from your email—there's no need to request another.",
          );
          return;
        }
        throw requestError;
      }
      setCode("");
      lastSubmittedCode.current = null;
      setStep("code");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to send a sign-in code",
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(candidate: string) {
    if (candidate.length < 4 || loading) return;
    if (lastSubmittedCode.current === candidate) return;
    lastSubmittedCode.current = candidate;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: verificationError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: candidate,
        type: "email",
      });
      if (verificationError) throw verificationError;
      router.replace("/admin");
      router.refresh();
    } catch {
      lastSubmittedCode.current = null;
      setError("That code is invalid or expired. Request a new code and try again.");
    } finally {
      setLoading(false);
    }
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    void verifyCode(code);
  }

  function startOver() {
    setStep("email");
    setCode("");
    setError(null);
    lastSubmittedCode.current = null;
  }

  function useExistingCode() {
    if (!email.trim() || !email.includes("@")) {
      setError("Enter the email address that received the code.");
      return;
    }
    setCode("");
    setError(null);
    lastSubmittedCode.current = null;
    setStep("code");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0e0e0e] px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a1a] p-8 text-white shadow-2xl shadow-black/30">
        <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-red-500">
          Onzio
        </p>
        <h1 className="mt-2 font-display text-3xl font-black uppercase">
          {step === "code"
            ? "Enter your code"
            : step === "unknown"
              ? "No account for that address"
              : "Admin Portal"}
        </h1>

        {step === "unknown" ? (
          <div className="mt-5 space-y-4 text-sm leading-6 text-white/65">
            <p>
              {UNKNOWN_ADDRESS_INTRO}{" "}
              <strong className="break-all text-white">{email.trim()}</strong>.
            </p>
            <p>
              Onzio accounts are set up by us — there&apos;s no signup. If your
              club is new, or you&apos;re using a different address than the one
              we set up for you, that&apos;s usually the reason.
            </p>
            <p>
              Double-check the address, or email us at{" "}
              <a
                href="mailto:onziofutbol@gmail.com"
                className="font-semibold text-red-400 underline decoration-red-400/40 underline-offset-4 hover:text-red-300"
              >
                onziofutbol@gmail.com
              </a>{" "}
              and we&apos;ll sort it out.
            </p>
            <button
              type="button"
              onClick={startOver}
              className="mt-2 w-full rounded-lg border border-white/15 py-3 font-display text-sm font-bold uppercase tracking-widest hover:border-white/30"
            >
              Try another address
            </button>
          </div>
        ) : step === "code" ? (
          <form onSubmit={submitCode} className="mt-8 space-y-5">
            <p className="text-sm leading-6 text-white/55">
              We sent a sign-in code to{" "}
              <strong className="break-all text-white/85">{email.trim()}</strong>.
            </p>
            <label className="block text-sm font-semibold" htmlFor="sign-in-code">
              Sign-in code
            </label>
            <input
              id="sign-in-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              pattern="[0-9]{4,10}"
              minLength={4}
              maxLength={10}
              value={code}
              onChange={(event) => {
                const nextCode = event.target.value
                  .replace(/\D/g, "")
                  .slice(0, 10);
                setCode(nextCode);
              }}
              className="w-full rounded-lg border border-white/10 bg-black px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-white outline-none focus:border-red-500"
            />
            <button
              type="submit"
              disabled={loading || code.length < 4}
              className="w-full rounded-lg bg-red-600 py-3 font-display font-black uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={startOver}
              className="w-full py-2 text-sm text-white/60 hover:text-white"
            >
              Use a different address
            </button>
          </form>
        ) : (
          <form onSubmit={requestCode} className="mt-8 space-y-4">
            <p className="text-sm leading-6 text-white/55">
              Enter the email address Onzio set up for your club. We&apos;ll send
              a one-time code—no password required.
            </p>
            <label className="block text-sm font-semibold" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
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
              {loading ? "Sending…" : "Send sign-in code"}
            </button>
            <button
              type="button"
              onClick={useExistingCode}
              className="w-full py-2 text-sm text-white/60 hover:text-white"
            >
              I already have a code
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
