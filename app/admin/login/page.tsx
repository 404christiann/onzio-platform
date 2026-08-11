"use client";

import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";

type LoginStep = "email" | "code" | "unknown";

const UNKNOWN_ADDRESS_ERROR = "Signups not allowed for otp";
const UNKNOWN_ADDRESS_INTRO = "We couldn't find an Onzio account for";
const EMAIL_COOLDOWN_ERROR = "over_email_send_rate_limit";
// The configured otp_length is 6 (supabase/config.toml), but production has
// drifted from that before and currently issues 8-digit codes — silently
// rejecting a correct code is worse than accepting whatever length the
// server actually issues. The client therefore accepts 4-10 digits and
// never hard-codes an exact count anywhere in submit gating. DEFAULT_BOX_COUNT
// only controls how many boxes render before typing; it's set to production's
// current actual length (8), not the stale config value, so pasting a real
// code doesn't visibly grow the grid. The grid still grows to fit longer
// codes if the length drifts again.
const DEFAULT_BOX_COUNT = 8;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeFocused, setCodeFocused] = useState(false);
  const [step, setStep] = useState<LoginStep>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSubmittedCode = useRef<string | null>(null);

  const boxCount = Math.max(DEFAULT_BOX_COUNT, code.length);
  const activeBoxIndex = Math.min(code.length, boxCount - 1);

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
    <main className="dark flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-foreground shadow-2xl shadow-black/30">
        <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-destructive">
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
          <div className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              {UNKNOWN_ADDRESS_INTRO}{" "}
              <strong className="break-all text-foreground">{email.trim()}</strong>.
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
                className="font-semibold text-destructive underline decoration-destructive/40 underline-offset-4 hover:text-foreground"
              >
                onziofutbol@gmail.com
              </a>{" "}
              and we&apos;ll sort it out.
            </p>
            <button
              type="button"
              onClick={startOver}
              className="mt-2 w-full rounded-lg border border-border py-3 font-display text-sm font-bold uppercase tracking-widest hover:border-foreground/30"
            >
              Try another address
            </button>
          </div>
        ) : step === "code" ? (
          <form onSubmit={submitCode} className="mt-8 space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">
              We sent a sign-in code to{" "}
              <strong className="break-all text-foreground">{email.trim()}</strong>.
            </p>
            <div>
              <label
                className="block text-sm font-semibold"
                htmlFor="sign-in-code"
              >
                Sign-in code
              </label>
              {/* One real input holds the whole code; the boxes are a purely
                  visual layer, so autofill, paste, and non-6-digit codes all
                  work without per-box juggling. The grid renders six boxes by
                  default and grows to match however many digits the server's
                  code actually has. */}
              <div className="relative mt-2.5">
                <div aria-hidden="true" className="flex items-center gap-1.5 sm:gap-2">
                  {Array.from({ length: boxCount }, (_, index) => (
                    <Fragment key={index}>
                      {boxCount % 2 === 0 && index === boxCount / 2 && (
                        <span
                          data-slot="otp-separator"
                          className="h-0.5 w-3 shrink-0 rounded-full bg-muted-foreground/60"
                        />
                      )}
                      <span
                        data-slot="otp-digit"
                        className={`flex h-11 min-w-0 max-w-12 flex-1 items-center justify-center rounded-lg border bg-background text-center font-mono text-xl text-foreground transition-shadow sm:h-12 ${
                          codeFocused && index === activeBoxIndex
                            ? "border-ring ring-[3px] ring-ring/50"
                            : "border-input"
                        }`}
                      >
                        {code[index] ?? ""}
                      </span>
                    </Fragment>
                  ))}
                </div>
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
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  className="absolute inset-0 h-full w-full cursor-text opacity-0"
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="destructive"
              disabled={loading || code.length < 4}
              className="h-auto w-full rounded-lg py-3 font-display font-black uppercase tracking-widest"
            >
              {loading ? "Verifying…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={startOver}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Use a different address
            </button>
          </form>
        ) : (
          <form onSubmit={requestCode} className="mt-8 space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
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
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground outline-none focus:border-ring"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-destructive py-3 font-display font-black uppercase tracking-widest text-destructive-foreground disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send sign-in code"}
            </button>
            <button
              type="button"
              onClick={useExistingCode}
              className="w-full py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              I already have a code
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
