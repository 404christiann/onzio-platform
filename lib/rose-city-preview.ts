import { normalizeHostname } from "@/lib/tenant";

/** The one held club this preview path may open. */
export const ROSE_CITY_PREVIEW_SLUG = "rose-city";

const VERCEL_PREVIEW_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/;

type PreviewEnv = Readonly<Record<string, string | undefined>>;

/**
 * RC-PREVIEW: the hostname a Vercel Preview deployment may serve Rose City's
 * public site on while the production hold stays in place, or null.
 *
 * All three are required: `RC_PREVIEW_UNHOLD` exactly "1", `VERCEL_ENV` exactly
 * "preview" (Vercel sets it; production is "production", so the flag is inert
 * there even if set), and `RC_PREVIEW_HOST` a single `<label>.vercel.app`
 * hostname. A custom domain is refused so a typo cannot open a real domain.
 */
export function roseCityPreviewHost(env: PreviewEnv = process.env): string | null {
  if (env.RC_PREVIEW_UNHOLD !== "1" || env.VERCEL_ENV !== "preview") return null;
  const declared = env.RC_PREVIEW_HOST;
  if (!declared) return null;
  let hostname: string;
  try {
    hostname = normalizeHostname(declared);
  } catch {
    return null;
  }
  return VERCEL_PREVIEW_HOST.test(hostname) ? hostname : null;
}
