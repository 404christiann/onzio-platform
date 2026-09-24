"use client";

import { ClipboardEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Image from "@/components/ResilientImage";
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
// only controls how many circles render before typing; it's set to production's
// current actual length (8). The row still grows to fit longer codes.
const DEFAULT_BOX_COUNT = 8;
// Auth does not tell the browser how many digits it just sent. A short pause
// lets a six-digit local code finish without verifying the first six digits
// of an eight-digit hosted code. Paste and one-time-code autofill are complete
// values, so those can verify immediately.
const TYPED_CODE_PAUSE_MS = 650;
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
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSubmittedCode = useRef<string | null>(null);
  const autoVerifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);

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

  useEffect(() => () => {
    if (autoVerifyTimer.current) clearTimeout(autoVerifyTimer.current);
  }, []);

  function cancelAutoVerify() {
    if (autoVerifyTimer.current) clearTimeout(autoVerifyTimer.current);
    autoVerifyTimer.current = null;
  }

  async function sendCode(isResend = false) {
    cancelAutoVerify();
    if (isResend) setResending(true);
    else setLoading(true);
    setError(null);
    setPasteHint(null);

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
          if (!isResend) {
            setCode("");
            lastSubmittedCode.current = null;
          }
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
      if (isResend) setResending(false);
      else setLoading(false);
    }
  }

  function requestCode(event: FormEvent) {
    event.preventDefault();
    void sendCode();
  }

  async function verifyCode(candidate: string) {
    cancelAutoVerify();
    if (candidate.length < 4 || loading || resending) return;
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

  function autoVerify(candidate: string, completeValue = false) {
    cancelAutoVerify();
    if (candidate.length < 4) return;
    if (completeValue) {
      void verifyCode(candidate);
      return;
    }
    // Supabase currently issues at least six digits. Keep the input's wider
    // 4-10 range for compatibility, but don't submit a half-typed code.
    if (candidate.length < 6) return;
    autoVerifyTimer.current = setTimeout(() => {
      autoVerifyTimer.current = null;
      void verifyCode(candidate);
    }, TYPED_CODE_PAUSE_MS);
  }

  function pasteCode(event: ClipboardEvent<HTMLInputElement>) {
    // Read the complete clipboard value before the input's maxLength can
    // truncate a code copied with spaces or surrounding email text.
    event.preventDefault();
    const digits = event.clipboardData.getData("text/plain").replace(/\D/g, "");
    if (digits) {
      const nextCode = digits.slice(0, 10);
      setCode(nextCode);
      setPasteHint(null);
      setError(null);
      autoVerify(nextCode, true);
    }
  }

  async function pasteFromClipboard() {
    codeInput.current?.focus();
    try {
      const clipboard = await navigator.clipboard.readText();
      const digits = clipboard.replace(/\D/g, "").slice(0, 10);
      if (!digits) {
        setPasteHint("No code was found on your clipboard. You can paste into the circles instead.");
        return;
      }
      setCode(digits);
      setError(null);
      setPasteHint(null);
      autoVerify(digits, true);
    } catch {
      // The native input remains available for Cmd/Ctrl+V and mobile's
      // long-press Paste menu if clipboard permission was not granted.
      setPasteHint("Use Paste on the code field to insert your code.");
    }
  }

  function startOver() {
    cancelAutoVerify();
    setStep("email");
    setCode("");
    setError(null);
    setPasteHint(null);
    lastSubmittedCode.current = null;
  }

  function useExistingCode() {
    if (!email.trim() || !email.includes("@")) {
      setError("Enter the email address that received the code.");
      return;
    }
    cancelAutoVerify();
    setCode("");
    setError(null);
    setPasteHint(null);
    lastSubmittedCode.current = null;
    setStep("code");
  }

  if (step === "code") {
    return (
      <main className="min-h-screen bg-white px-5 pb-16 pt-7 text-[#202235] sm:px-10 sm:pt-10">
        <button
          type="button"
          onClick={startOver}
          disabled={loading || resending}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#f5f5f7] px-5 text-sm font-semibold text-[#202235] transition-colors hover:bg-[#eaeaef] active:bg-[#dedee5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6158dc]"
        >
          Back
        </button>

        <section className="mx-auto mt-8 w-full max-w-[660px] text-center sm:mt-4 lg:mt-8">
          <Image
            src="/images/onzio/onzio-black-logo-no-bg-trimmed.png"
            alt="Onzio"
            width={352}
            height={92}
            priority
            className="mx-auto mb-7 h-auto w-24 sm:mb-8 sm:w-32"
          />
          <h1 className="font-body text-[30px] font-semibold normal-case leading-tight tracking-[-0.05em] sm:text-[40px]">
            Enter your code
          </h1>
          <p className="mx-auto mt-3 max-w-[500px] text-sm leading-6 text-[#6a6d7e] sm:text-base">
            We sent a one-time code to{" "}
            <span className="block break-words sm:inline">
              <strong className="font-semibold text-[#202235]">{email.trim()}</strong>.
            </span>
            <br className="hidden sm:block" /> Enter it to access your Onzio admin portal.
          </p>

          <div className="relative mt-10 sm:mt-12">
            <form
              onSubmit={submitCode}
              aria-hidden={loading}
              inert={loading}
              className={`transition-opacity duration-300 ${
                loading ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
            >
              <label htmlFor="sign-in-code" className="sr-only">Sign-in code</label>
              <div className="relative mx-auto max-w-[490px]">
                <div aria-hidden="true" className="flex items-center justify-center gap-1 sm:gap-2">
                  {Array.from({ length: boxCount }, (_, index) => (
                    <span
                      key={index}
                      data-slot="otp-digit"
                      className={`flex min-w-0 max-w-[51px] flex-1 aspect-square items-center justify-center rounded-full text-[16px] font-semibold text-[#26283a] sm:text-[22px] ${
                        codeFocused && index === activeBoxIndex
                          ? "border-[1.5px] border-[#6158dc] bg-white"
                          : "bg-[#f5f5fb]"
                      } ${index === Math.floor(boxCount / 2) && index > 0 ? "ml-1 sm:ml-2" : ""}`}
                    >
                      {code[index] ?? ""}
                    </span>
                  ))}
                </div>
                <input
                  ref={codeInput}
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
                    const nextCode = event.target.value.replace(/\D/g, "").slice(0, 10);
                    setCode(nextCode);
                    setError(null);
                    setPasteHint(null);
                    autoVerify(nextCode, nextCode.length - code.length > 1);
                  }}
                  onPaste={pasteCode}
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none [-webkit-text-fill-color:transparent]"
                />
              </div>

              <button
                type="button"
                onClick={() => void pasteFromClipboard()}
                disabled={loading || resending}
                className="mt-7 text-sm font-semibold text-[#6158dc] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6158dc]"
              >
                Paste code
              </button>
              {pasteHint && <p role="status" className="mx-auto mt-2 max-w-xs text-xs text-[#6a6d7e]">{pasteHint}</p>}
              <p className="mt-5 text-sm text-[#777b8d]">
                Didn&apos;t get it?{" "}
                <button
                  type="button"
                  disabled={loading || resending}
                  onClick={() => void sendCode(true)}
                  className="font-semibold text-[#6158dc] underline underline-offset-4 disabled:opacity-50 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6158dc]"
                >
                  {resending ? "Sending…" : "Resend code"}
                </button>
              </p>
            </form>

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center animate-in fade-in duration-300">
                <AdminLoading tone="brand" className="text-sm font-semibold tracking-wide" />
              </div>
            )}
          </div>
          {error && <p role="alert" className="mx-auto mt-6 max-w-md text-sm text-red-600">{error}</p>}
        </section>
      </main>
    );
  }

  if (step === "email") {
    return (
      <main aria-label="Onzio sign in" className="min-h-screen bg-white px-5 pb-16 pt-[116px] text-[#202235] sm:px-10 sm:pt-[180px]">
        <section className="mx-auto w-full max-w-[510px] text-center">
          <Image
            src="/images/onzio/onzio-black-logo-no-bg-trimmed.png"
            alt="Onzio"
            width={352}
            height={92}
            priority
            className="mx-auto h-auto w-28 sm:w-[132px]"
          />
          <p className="mx-auto mt-4 max-w-[460px] text-sm leading-6 text-[#6a6d7e] sm:text-base">
            Enter the email address for your club account. We&apos;ll send you a one-time code.
          </p>

          <form onSubmit={requestCode} className="mx-auto mt-[42px] w-full max-w-[440px] text-left sm:mt-[45px]">
            <label className="block text-sm font-semibold" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              placeholder="name@yourclub.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2.5 h-[54px] w-full rounded-[13px] border border-[#d7d9e4] bg-white px-4 text-base text-[#202235] outline-none focus:border-[#6158dc] focus:ring-4 focus:ring-[#6158dc]/10"
            />
            <button
              type="submit"
              disabled={loading}
              className="mt-4 min-h-[52px] w-full rounded-[13px] bg-[#6158dc] text-[15px] font-semibold text-white transition-colors hover:bg-[#5148c6] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6158dc]"
            >
              {loading ? "Sending…" : "Send sign-in code"}
            </button>
            <button
              type="button"
              onClick={useExistingCode}
              className="mx-auto mt-4 flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-[#6158dc] underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6158dc]"
            >
              I already have a code
            </button>
          </form>

          {error && <p role="alert" className="mx-auto mt-5 max-w-md text-sm text-red-600">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="dark flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-foreground shadow-2xl shadow-black/30">
        {/* The real Onzio wordmark replaces the styled text lockup that used
            to stand in for it. The source PNG is a 500x500 square whose
            artwork only occupies x 76-425 / y 196-286, so the negative
            margins below crop the surrounding transparent padding back off.
            Rendered at 132px the visible mark is ~92x24. This is the
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
        <div className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
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

        {error && (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
