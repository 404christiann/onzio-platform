import type Stripe from "stripe";
import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  getOperatorClient,
  isContractSimulation,
  operatorAccessTokenSchema,
  parseOperatorInput,
  uuidSchema,
  writeOperatorAudit,
  type OperatorDependencies,
} from "@/lib/operator/shared";
import {
  resolveConnectStripeCredentials,
  type ConnectEnv,
  type ConnectStripeCredentials,
  type ConnectStripeMode,
} from "@/lib/stripe/connect-config";
import {
  createConnectStripeClient,
  type ConnectStripeClient,
} from "@/lib/stripe/connect-client";
import { resolveClubPrimaryOrigin } from "@/lib/stripe/connect-origin";

/**
 * Operator-initiated Stripe Connect **Standard** onboarding for one club.
 *
 * Onboarding is operator work, not club self-service, for the same reason
 * `onzio.clubs.payments_live_enabled` is operator-only: the connected account
 * decides where a family's money lands. Like every other function in
 * `lib/operator/`, it requires an AAL2 operator session no older than two
 * hours, refuses invocation from an application route
 * (`assertDirectOperatorInvocation`), and writes an audit event.
 *
 * The link returned is Stripe-hosted (`accountLinks.create` with
 * `type: 'account_onboarding'`); Onzio collects no bank, tax, or identity
 * detail itself. The account is created as `type: 'standard'`, so the club
 * gets its own full Stripe Dashboard and owns disputes, refunds, and tax
 * reporting outright.
 *
 * ## Mode
 *
 * The account is created with whatever credentials
 * `resolveConnectStripeCredentials` allows for this club. In the current phase
 * that is always test mode, so onboarding produces a Stripe **test** connected
 * account — which is the point: no club can take real money before it has
 * signed.
 *
 * ## Partial-failure behaviour
 *
 * Account creation carries an idempotency key derived from the club id and
 * mode. If the account is created but persisting
 * `clubs.stripe_connect_account_id` then fails, re-running this function
 * returns the *same* Stripe account instead of stranding the first one and
 * creating a second. A Standard account cannot simply be deleted by the
 * platform, so idempotent re-creation is the only safe recovery.
 */

const createConnectOnboardingLinkSchema = z.object({
  clubId: uuidSchema,
  operatorAccessToken: operatorAccessTokenSchema,
  invokedFromApplicationRoute: z.boolean().optional(),
});

export type ConnectOnboardingDependencies = OperatorDependencies & {
  createStripeClient?: (
    credentials: ConnectStripeCredentials,
  ) => ConnectStripeClient;
  env?: ConnectEnv;
  origin?: string;
};

export type CreateConnectOnboardingLinkInput = z.input<
  typeof createConnectOnboardingLinkSchema
> & {
  dependencies?: ConnectOnboardingDependencies;
};

export type ConnectOnboardingLink = {
  clubId: string;
  accountId: string;
  accountCreated: boolean;
  mode: ConnectStripeMode;
  onboardingUrl: string;
  expiresAt: number;
  audited: boolean;
};

export async function createConnectOnboardingLink(
  rawInput: CreateConnectOnboardingLinkInput,
): Promise<ConnectOnboardingLink> {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(createConnectOnboardingLinkSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  const { actorId } = await assertOperator(
    input.operatorAccessToken,
    dependencies,
  );

  if (isContractSimulation(dependencies)) {
    return {
      clubId: input.clubId,
      accountId: "acct_simulated",
      accountCreated: false,
      mode: "test",
      onboardingUrl: "https://connect.stripe.com/setup/s/simulated",
      expiresAt: 0,
      audited: true,
    };
  }

  const env = dependencies?.env ?? process.env;
  const client = getOperatorClient(dependencies);

  const { data: club, error: clubError } = await client
    .schema("onzio")
    .from("clubs")
    .select("id,name,lifecycle,stripe_connect_account_id,payments_live_enabled")
    .eq("id", input.clubId)
    .maybeSingle();
  if (clubError || !club) failContract("CLUB_NOT_FOUND");
  if (club.lifecycle === "archived") failContract("CLUB_ARCHIVED");

  const credentials = resolveConnectStripeCredentials({
    paymentsLiveEnabled: club.payments_live_enabled === true,
    env,
  });
  const stripe = (
    dependencies?.createStripeClient ??
    ((value: ConnectStripeCredentials) => createConnectStripeClient(value, env))
  )(credentials);

  const origin =
    dependencies?.origin ??
    (await resolveClubPrimaryOrigin(client, input.clubId, env));
  if (!origin) failContract("CLUB_ORIGIN_UNAVAILABLE");

  let accountId: string | null = club.stripe_connect_account_id ?? null;
  let accountCreated = false;

  if (!accountId) {
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.create(
        {
          type: "standard",
          metadata: { onzio_club_id: input.clubId },
        },
        {
          idempotencyKey: `onzio_connect_account:${credentials.mode}:${input.clubId}`,
        },
      );
    } catch (error) {
      failContract(
        "CONNECT_ACCOUNT_CREATE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
    accountId = account.id;
    accountCreated = true;

    const { error: persistError } = await client
      .schema("onzio")
      .from("clubs")
      .update({ stripe_connect_account_id: accountId })
      .eq("id", input.clubId);
    if (persistError) {
      failContract("CONNECT_ACCOUNT_PERSIST_FAILED", persistError.message);
    }
  }

  let link: Stripe.AccountLink;
  try {
    link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      // Stripe expires these links quickly and sends the club back to
      // refresh_url when one goes stale; both point at the club's own admin
      // payments surface on its verified domain.
      refresh_url: `${origin}/admin/payments?connect=refresh`,
      return_url: `${origin}/admin/payments?connect=return`,
    });
  } catch (error) {
    failContract(
      "CONNECT_ONBOARDING_LINK_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }

  await writeOperatorAudit(client, {
    actorId,
    clubId: input.clubId,
    operation: accountCreated
      ? "connect_account_created"
      : "connect_onboarding_link_issued",
    resourceType: "club_connect_account",
    resourceId: accountId,
    // Deliberately no URL and no key material: the onboarding link is a
    // bearer credential for the club's Stripe account.
    payload: {
      connect_account_id: accountId,
      mode: credentials.mode,
      account_created: accountCreated,
    },
  });

  return {
    clubId: input.clubId,
    accountId,
    accountCreated,
    mode: credentials.mode,
    onboardingUrl: link.url,
    expiresAt: link.expires_at,
    audited: true,
  };
}
