export type PublicAccess = "preview" | "live" | "grace" | "suspended";

type AccessInput = {
  lifecycle?: unknown;
  publicAccess?: unknown;
  public_access?: unknown;
  status?: unknown;
  paidThrough?: unknown;
  paid_through?: unknown;
};

const GRACE_PERIOD_MS = 20 * 24 * 60 * 60 * 1000;

function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolvePublicAccess(
  input: AccessInput,
  now = new Date(),
): PublicAccess {
  if (input.lifecycle === "archived") return "suspended";
  if (input.lifecycle === "onboarding") return "preview";

  const explicitAccess = input.publicAccess ?? input.public_access;
  if (
    explicitAccess === "preview" ||
    explicitAccess === "live" ||
    explicitAccess === "grace" ||
    explicitAccess === "suspended"
  ) {
    return explicitAccess;
  }

  if (input.status === "trialing") return "suspended";
  if (input.status === "active") {
    return "live";
  }

  const paidThrough = parseTime(input.paidThrough ?? input.paid_through);
  if (paidThrough !== null) {
    if (now.getTime() <= paidThrough) return "live";
    if (now.getTime() <= paidThrough + GRACE_PERIOD_MS) return "grace";
  }

  return "suspended";
}
