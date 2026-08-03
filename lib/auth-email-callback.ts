import type { EmailOtpType } from "@supabase/supabase-js";

const SUPPORTED_EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "invite",
  "magiclink",
  "recovery",
]);

export type SupportedEmailOtpType =
  | "email"
  | "invite"
  | "magiclink"
  | "recovery";

export function parseEmailOtpType(
  value: string | null,
): SupportedEmailOtpType | null {
  if (!value || !SUPPORTED_EMAIL_OTP_TYPES.has(value as EmailOtpType)) {
    return null;
  }
  return value as SupportedEmailOtpType;
}

export function resolveAuthCallbackDestination(input: {
  type: SupportedEmailOtpType | null;
  requestedNext: string | null;
}): "/admin" {
  void input;
  return "/admin";
}

export function createAuthEmailCallbackUrl(origin: string): string {
  return new URL("/admin/auth/callback", origin).toString();
}
