"use client";

import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Image from "@/components/ResilientImage";
import { Button } from "@/components/ui/button";
import AdminLoading from "@/components/admin/AdminLoading";

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
// Floor on how long the post-submit loading state stays up. `verifyOtp` can
// resolve in a few dozen milliseconds locally and on fast hosted connections,
// which makes the code-card → AdminLoading crossfade imperceptible — it reads
// as a jump-cut straight to /admin rather than as a deliberate transition.
// Racing the request against this timer guarantees the spinner is actually
// seen, on both the success and the invalid-code path. This is the only
// artificial delay in the file; the email-send step is deliberately not
// floored, and the crossfade's own duration-300 timing is unrelated to it.
const MIN_VERIFY_LOADING_MS = 900;

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
      const [{ error: verificationError }] = await Promise.all([
        supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: candidate,
          type: "email",
        }),
        new Promise((resolve) => setTimeout(resolve, MIN_VERIFY_LOADING_MS)),
      ]);
      if (verificationError) throw verificationError;
      // Deliberately leave `loading` true on success: the spinner should
      // stay up through the /admin navigation instead of the form fading
      // back in for the remainder of it. This unmounts with the page, or
      // clears in the catch block below if verification actually failed.
      router.replace("/admin");
      router.refresh();
    } catch {
      lastSubmittedCode.current = null;
      setError("That code is invalid or expired. Request a new code and try again.");
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
        {/* The real Onzio wordmark replaces the styled text lockup that used
            to stand in for it. The source PNG is a 500x500 square whose
            artwork only occupies x 76-425 / y 196-286, so the negative
            margins below crop the surrounding transparent padding back off
            and leave the wordmark optically flush with the heading beneath
            it. Rendered at 132px the visible mark is ~92x24. This is the
            Onzio platform's own mark and is unrelated to the per-club logo
            in the admin sidebar, which stays tenant-driven. */}
        <Image
          src="/images/onzio/onzio-wordmark-white.png"
          alt="Onzio"
          width={132}
          height={132}
          priority
          className="-ml-[20px] -mt-[52px] -mb-[56px] max-w-none"
        />
        {/* The email step deliberately has no heading — the wordmark above is
            the only title that screen needs. Rendering nothing (rather than an
            empty h1) also removes the heading's own 36px box and its mt-2, so
            no dead space is left behind; the logo's negative bottom margin
            already lands the flow cursor at the wordmark's visible baseline,
            so the email form's own top margin becomes the whole visible gap.
            The code and unknown steps keep their headings unchanged. */}
        {step !== "email" && (
          <h1 className="mt-2 font-display text-3xl font-black uppercase">
            {step === "code" ? "Enter your code" : "No account for that address"}
          </h1>
        )}

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
                className="font-semibold text-brand underline decoration-brand/40 underline-offset-4 hover:text-foreground"
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
          /* Submitting swaps the whole code-entry card for a loading state
             rather than only relabelling the button. Both children stay
             mounted in the same box so the swap is a real crossfade instead
             of a jump-cut, and the form is made inert (opacity 0,
             pointer-events off, aria-hidden) so it is genuinely replaced
             rather than covered by an overlay. None of the flexible-length
             OTP logic below is touched by this — only what renders while a
             verification is in flight. */
          <div className="relative mt-8">
            <form
              onSubmit={submitCode}
              aria-hidden={loading}
              className={`space-y-5 transition-opacity duration-300 ${
                loading ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
            >
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
                variant="brand"
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

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center animate-in fade-in duration-300">
                <AdminLoading
                  tone="brand"
                  className="font-display text-sm font-bold uppercase tracking-[0.25em]"
                />
              </div>
            )}
          </div>
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
              className="w-full rounded-lg bg-brand py-3 font-display font-black uppercase tracking-widest text-brand-foreground disabled:opacity-50"
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
