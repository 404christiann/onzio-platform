"use client";

import {
  ClipboardEvent,
  FormEvent,
  Fragment,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";

type LoginStep = "email" | "code" | "unknown";

const UNKNOWN_ADDRESS_ERROR = "Signups not allowed for otp";
const UNKNOWN_ADDRESS_INTRO = "We couldn't find an Onzio account for";
const EMAIL_COOLDOWN_ERROR = "over_email_send_rate_limit";
const CODE_LENGTH = 6;

function emptyCodeDigits(): string[] {
  return Array.from({ length: CODE_LENGTH }, () => "");
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [codeDigits, setCodeDigits] = useState<string[]>(emptyCodeDigits);
  const [step, setStep] = useState<LoginStep>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSubmittedCode = useRef<string | null>(null);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const code = codeDigits.join("");

  function focusCodeBox(index: number) {
    const clamped = Math.min(Math.max(index, 0), CODE_LENGTH - 1);
    codeInputRefs.current[clamped]?.focus();
  }

  function fillCodeFrom(index: number, digits: string) {
    const next = [...codeDigits];
    let cursor = index;
    for (const digit of digits) {
      if (cursor >= CODE_LENGTH) break;
      next[cursor] = digit;
      cursor += 1;
    }
    setCodeDigits(next);
    focusCodeBox(cursor);
  }

  function handleCodeChange(index: number, value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits === "") {
      const next = [...codeDigits];
      next[index] = "";
      setCodeDigits(next);
      return;
    }
    if (digits.length === 1) {
      const next = [...codeDigits];
      next[index] = digits;
      setCodeDigits(next);
      focusCodeBox(index + 1);
      return;
    }
    // Multi-character input (paste or one-time-code autofill). When the
    // browser appended a typed digit after the existing one, keep the new
    // digit only; otherwise spread the whole string across the boxes.
    const spread =
      digits.length === 2 && digits[0] === codeDigits[index]
        ? digits.slice(1)
        : digits;
    fillCodeFrom(index, spread);
  }

  function handleCodeKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...codeDigits];
      if (next[index]) {
        next[index] = "";
        setCodeDigits(next);
      } else if (index > 0) {
        next[index - 1] = "";
        setCodeDigits(next);
        focusCodeBox(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCodeBox(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCodeBox(index + 1);
    }
  }

  function handleCodePaste(
    index: number,
    event: ClipboardEvent<HTMLInputElement>,
  ) {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (digits) fillCodeFrom(index, digits);
  }

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
          setCodeDigits(emptyCodeDigits());
          lastSubmittedCode.current = null;
          setStep("code");
          setError(
            "A sign-in code was sent recently. Enter the code from your email—there's no need to request another.",
          );
          return;
        }
        throw requestError;
      }
      setCodeDigits(emptyCodeDigits());
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
    setCodeDigits(emptyCodeDigits());
    setError(null);
    lastSubmittedCode.current = null;
  }

  function useExistingCode() {
    if (!email.trim() || !email.includes("@")) {
      setError("Enter the email address that received the code.");
      return;
    }
    setCodeDigits(emptyCodeDigits());
    setError(null);
    lastSubmittedCode.current = null;
    setStep("code");
  }

  return (
    <main className="dark flex min-h-screen items-center justify-center bg-[#0e0e0e] px-6 py-10">
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
            <div>
              <label
                className="block text-sm font-semibold"
                htmlFor="sign-in-code-0"
                id="sign-in-code-label"
              >
                Sign-in code
              </label>
              <div
                role="group"
                aria-labelledby="sign-in-code-label"
                className="mt-2.5 flex items-center gap-1.5 sm:gap-2"
              >
                {codeDigits.map((digit, index) => (
                  <Fragment key={index}>
                    {index === CODE_LENGTH / 2 && (
                      <span
                        aria-hidden="true"
                        data-slot="otp-separator"
                        className="h-0.5 w-3 shrink-0 rounded-full bg-muted-foreground/60"
                      />
                    )}
                    <input
                      ref={(element) => {
                        codeInputRefs.current[index] = element;
                      }}
                      id={`sign-in-code-${index}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]"
                      maxLength={1}
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      autoFocus={index === 0}
                      aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
                      value={digit}
                      onChange={(event) =>
                        handleCodeChange(index, event.target.value)
                      }
                      onKeyDown={(event) => handleCodeKeyDown(index, event)}
                      onPaste={(event) => handleCodePaste(index, event)}
                      onFocus={(event) => event.target.select()}
                      data-slot="otp-digit"
                      className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background text-center font-mono text-xl text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-12 sm:w-12 sm:flex-none"
                    />
                  </Fragment>
                ))}
              </div>
            </div>
            <Button
              type="submit"
              variant="destructive"
              disabled={loading || code.length !== CODE_LENGTH}
              className="h-auto w-full rounded-lg py-3 font-display font-black uppercase tracking-widest"
            >
              {loading ? "Verifying…" : "Sign in"}
            </Button>
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
