const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertSafeTestEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  const supabaseUrl =
    env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
  const parsed = new URL(supabaseUrl);

  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `[TEST SAFETY] Refusing non-local Supabase URL: ${parsed.hostname}`,
    );
  }

  const stripeKey = env.STRIPE_TEST_SECRET_KEY ?? "sk_test_contract_only";
  if (stripeKey.startsWith("sk_live_")) {
    throw new Error("[TEST SAFETY] Refusing a live Stripe secret key.");
  }

  const webhookSecret =
    env.STRIPE_TEST_WEBHOOK_SECRET ?? "whsec_test_contract_only";
  if (/live/i.test(webhookSecret)) {
    throw new Error("[TEST SAFETY] Refusing a live Stripe webhook secret.");
  }

  return {
    supabaseUrl,
    stripeKey,
    webhookSecret,
  };
}

/** The isolated Auth stack captures mail on its own local Mailpit port. */
export function localMailpitBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = new URL(env.SUPABASE_TEST_MAILPIT_URL ?? "http://127.0.0.1:54324");
  if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("[TEST SAFETY] Refusing a non-loopback Mailpit URL.");
  }
  return url.origin;
}
