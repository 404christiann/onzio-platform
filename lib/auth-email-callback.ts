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
}): "/admin" | "/admin/update-password" {
  if (input.type === "invite" || input.type === "recovery") {
    return "/admin/update-password";
  }
  return input.requestedNext === "/admin/update-password"
    ? "/admin/update-password"
    : "/admin";
}

export function createAuthEmailCallbackUrl(origin: string): string {
  return new URL("/admin/auth/callback", origin).toString();
}
