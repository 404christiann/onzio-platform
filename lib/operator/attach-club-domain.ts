import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import { normalizeHostname } from "@/lib/tenant";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  getOperatorClient,
  isContractSimulation,
  mapDatabaseConflict,
  operatorAccessTokenSchema,
  operatorNow,
  parseOperatorInput,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const attachClubDomainSchema = z.object({
  clubId: uuidSchema,
  operatorAccessToken: operatorAccessTokenSchema,
  hostname: z.string().min(1),
  environment: z.enum(["staging", "production"]),
  makePrimary: z.boolean(),
  invokedFromApplicationRoute: z.boolean().optional(),
});

export type AttachClubDomainInput = z.input<typeof attachClubDomainSchema> & {
  dependencies?: OperatorDependencies;
};

/**
 * Attaches an additional verified hostname to a club that is already
 * provisioned — e.g. moving a live tenant off its Vercel default subdomain
 * onto a real purchased domain. Unlike provisionClub (new club + its first
 * domain), this never creates a club, and `verified_at` is stamped
 * immediately: the calling operator is trusted to have confirmed DNS/domain
 * ownership out of band (Vercel's own registrar+nameserver verification,
 * here) — there is no automated DNS challenge in this function.
 *
 * Idempotent: re-running with the exact same (clubId, hostname, environment,
 * makePrimary) after a partial failure is a safe no-op rather than a
 * DOMAIN_CONFLICT, so a script that attaches several hostnames in sequence
 * can just be re-run after fixing whatever caused an earlier one to fail.
 */
export async function attachClubDomain(rawInput: AttachClubDomainInput) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(attachClubDomainSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  const { actorId } = await assertOperator(
    input.operatorAccessToken,
    dependencies,
  );
  const hostname = normalizeHostname(input.hostname);

  if (isContractSimulation(dependencies)) {
    return {
      clubId: input.clubId,
      hostname,
      environment: input.environment,
      isPrimary: input.makePrimary,
      previousPrimaryHostname: null,
      alreadyAttached: false,
      audited: true,
    };
  }

  const client = getOperatorClient(dependencies);
  const now = operatorNow(dependencies).toISOString();

  const { data: club, error: clubError } = await client
    .schema("onzio")
    .from("clubs")
    .select("id,lifecycle")
    .eq("id", input.clubId)
    .maybeSingle();
  if (clubError || !club) failContract("CLUB_NOT_FOUND");
  if (club.lifecycle === "archived") failContract("CLUB_ARCHIVED");

  const { data: existing, error: existingReadError } = await client
    .schema("onzio")
    .from("club_domains")
    .select("id,is_primary,active,verified_at")
    .eq("club_id", input.clubId)
    .eq("environment", input.environment)
    .eq("hostname", hostname)
    .maybeSingle();
  if (existingReadError) {
    failContract("DOMAIN_ATTACH_FAILED", existingReadError.message);
  }
  if (existing) {
    const alreadyExactMatch =
      existing.active &&
      existing.verified_at !== null &&
      existing.is_primary === input.makePrimary;
    if (alreadyExactMatch) {
      return {
        clubId: input.clubId,
        hostname,
        environment: input.environment,
        isPrimary: input.makePrimary,
        previousPrimaryHostname: null,
        alreadyAttached: true,
        audited: false,
      };
    }
    failContract("DOMAIN_ALREADY_ATTACHED_DIFFERENTLY");
  }

  let previousPrimary: { id: string; hostname: string } | null = null;
  if (input.makePrimary) {
    const { data: currentPrimary, error: primaryReadError } = await client
      .schema("onzio")
      .from("club_domains")
      .select("id,hostname")
      .eq("club_id", input.clubId)
      .eq("environment", input.environment)
      .eq("is_primary", true)
      .eq("active", true)
      .maybeSingle();
    if (primaryReadError) {
      failContract("DOMAIN_ATTACH_FAILED", primaryReadError.message);
    }
    if (currentPrimary) {
      previousPrimary = currentPrimary;
      const demote = await client
        .schema("onzio")
        .from("club_domains")
        .update({ is_primary: false, updated_at: now })
        .eq("id", currentPrimary.id);
      if (demote.error) {
        failContract("DOMAIN_ATTACH_FAILED", demote.error.message);
      }
    }
  }

  const insert = await client
    .schema("onzio")
    .from("club_domains")
    .insert({
      club_id: input.clubId,
      hostname,
      is_primary: input.makePrimary,
      verified_at: now,
      environment: input.environment,
      active: true,
    })
    .select("id")
    .single();
  if (insert.error || !insert.data) {
    if (previousPrimary) {
      await client
        .schema("onzio")
        .from("club_domains")
        .update({ is_primary: true, updated_at: now })
        .eq("id", previousPrimary.id);
    }
    mapDatabaseConflict(
      insert.error ?? { message: "club_domains insert returned no row" },
      "DOMAIN_ATTACH_FAILED",
    );
  }

  try {
    await writeOperatorAudit(client, {
      actorId,
      clubId: input.clubId,
      operation: "domain_attached",
      resourceType: "club_domain",
      resourceId: insert.data.id,
      payload: {
        hostname,
        environment: input.environment,
        is_primary: input.makePrimary,
        previous_primary_hostname: previousPrimary?.hostname ?? null,
      },
    });
  } catch (error) {
    await client
      .schema("onzio")
      .from("club_domains")
      .delete()
      .eq("id", insert.data.id);
    if (previousPrimary) {
      await client
        .schema("onzio")
        .from("club_domains")
        .update({ is_primary: true, updated_at: now })
        .eq("id", previousPrimary.id);
    }
    failContract(
      "DOMAIN_ATTACH_AUDIT_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    clubId: input.clubId,
    hostname,
    environment: input.environment,
    isPrimary: input.makePrimary,
    previousPrimaryHostname: previousPrimary?.hostname ?? null,
    alreadyAttached: false,
    audited: true,
  };
}
