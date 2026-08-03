import type { SupabaseClient } from "@supabase/supabase-js";
import { failContract } from "@/lib/contract-error";

export const CLUB_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
export const OPERATOR_TOTP_MAX_AGE_MS = 2 * 60 * 60 * 1_000;

type AmrEntry = {
  method?: unknown;
  timestamp?: unknown;
};

export type AuthClaims = {
  sub?: unknown;
  aal?: unknown;
  amr?: unknown;
  [key: string]: unknown;
};

function validTimestamp(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,12}$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
  const milliseconds = numeric * 1_000;
  return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : null;
}

function amrEntries(claims: AuthClaims): AmrEntry[] {
  return Array.isArray(claims.amr)
    ? claims.amr.filter(
        (entry): entry is AmrEntry =>
          typeof entry === "object" && entry !== null,
      )
    : [];
}

export function clubSessionStartedAt(claims: AuthClaims): Date | null {
  const timestamps = amrEntries(claims)
    .map((entry) => validTimestamp(entry.timestamp))
    .filter((value): value is number => value !== null);
  return timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
}

export function operatorTotpVerifiedAt(claims: AuthClaims): Date | null {
  const timestamps = amrEntries(claims)
    .filter((entry) => entry.method === "totp")
    .map((entry) => validTimestamp(entry.timestamp))
    .filter((value): value is number => value !== null);
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
}

function isWithinAge(value: Date | null, maxAgeMs: number, now: Date): boolean {
  if (!value) return false;
  const age = now.getTime() - value.getTime();
  return age >= 0 && age <= maxAgeMs;
}

export function isClubSessionFresh(
  claims: AuthClaims,
  now = new Date(),
): boolean {
  return isWithinAge(clubSessionStartedAt(claims), CLUB_SESSION_MAX_AGE_MS, now);
}

export function isOperatorSessionFresh(
  claims: AuthClaims,
  now = new Date(),
): boolean {
  return (
    claims.aal === "aal2" &&
    isWithinAge(operatorTotpVerifiedAt(claims), OPERATOR_TOTP_MAX_AGE_MS, now)
  );
}

export async function verifyAccessTokenClaims(
  client: SupabaseClient<any, any, any>,
  accessToken: string,
): Promise<AuthClaims | null> {
  const verifiedClaims = await client.auth.getClaims(accessToken);
  if (verifiedClaims.error || !verifiedClaims.data?.claims) return null;
  return verifiedClaims.data.claims as AuthClaims;
}

export async function requireFreshClubSession(
  client: SupabaseClient<any, any, any>,
  now = new Date(),
): Promise<{ userId: string; claims: AuthClaims; startedAt: Date }> {
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims as AuthClaims | undefined;
  if (error || !claims || typeof claims.sub !== "string") {
    failContract("AUTHENTICATION_REQUIRED");
  }
  const startedAt = clubSessionStartedAt(claims);
  if (!isWithinAge(startedAt, CLUB_SESSION_MAX_AGE_MS, now)) {
    failContract("SESSION_EXPIRED");
  }
  return { userId: claims.sub, claims, startedAt: startedAt! };
}
