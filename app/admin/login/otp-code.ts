const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 10;

// Auth's signInWithOtp response does not disclose the length of the code it
// sent. A typed code can only auto-submit safely when that length is known.
export function expectedEmailCodeLength(
  configuredLength: string | undefined,
  supabaseUrl: string | undefined,
): number | null {
  if (configuredLength !== undefined) {
    const length = Number(configuredLength);
    return Number.isInteger(length) && length >= MIN_CODE_LENGTH && length <= MAX_CODE_LENGTH
      ? length
      : null;
  }

  // Local Supabase uses the checked-in otp_length = 6. Hosted environments
  // must set NEXT_PUBLIC_ONZIO_EMAIL_OTP_LENGTH to their actual Auth setting.
  try {
    const hostname = new URL(supabaseUrl ?? "").hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return 6;
  } catch {
    // Missing/invalid URL cannot establish an authoritative length.
  }
  return null;
}

export function shouldAutoVerifyEmailCode(
  code: string,
  expectedLength: number | null,
  completeValue: boolean,
): boolean {
  return code.length >= MIN_CODE_LENGTH &&
    (completeValue || (expectedLength !== null && code.length === expectedLength));
}

export function extractPastedEmailCode(text: string): string | null {
  // Match each uninterrupted numeric phrase. Words, punctuation, and newlines
  // separate phrases, so "Code: 428 913. Expires in 10 minutes" never becomes
  // 42891310. Spaces and hyphens *within* a code are supported.
  const phrases = Array.from(text.matchAll(/\d+(?:[ \t\u00a0\u202f\u2010-\u2015-]+\d+)*/g));
  const candidates = phrases
    .map((match) => ({ code: match[0].replace(/\D/g, ""), index: match.index }))
    .filter(({ code }) => code.length >= MIN_CODE_LENGTH && code.length <= MAX_CODE_LENGTH);

  if (candidates.length === 1) return candidates[0].code;
  if (candidates.length === 0) return null;

  // If other long numbers appear in copied email text, use a uniquely
  // labeled code. Ambiguous text is left for the user to select explicitly.
  const label = /\b(?:one[- ]time\s+|sign[- ]in\s+|verification\s+)?code\s*(?::|#|-|is)?\s*/gi;
  const labeled = Array.from(text.matchAll(label))
    .map((match) => candidates.find(({ index }) => index === match.index + match[0].length))
    .filter((candidate): candidate is (typeof candidates)[number] => candidate !== undefined);
  return labeled.length === 1 ? labeled[0].code : null;
}
