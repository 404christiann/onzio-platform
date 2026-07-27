type BillingEnv = Record<string, string | undefined> & {
  BILLING_ADMIN_EMAIL?: string;
  BILLING_ADMIN_EMAILS?: string;
};

function parseEmailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getBillingAdminEmails(env: BillingEnv = process.env): string[] {
  return Array.from(
    new Set([
      ...parseEmailList(env.BILLING_ADMIN_EMAIL),
      ...parseEmailList(env.BILLING_ADMIN_EMAILS),
    ]),
  );
}

export function isBillingAdminEmail(
  email: string | null | undefined,
  env: BillingEnv = process.env,
): boolean {
  if (!email) return false;
  return getBillingAdminEmails(env).includes(email.trim().toLowerCase());
}
