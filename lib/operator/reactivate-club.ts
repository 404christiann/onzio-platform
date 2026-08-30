import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  getOperatorClient,
  isContractSimulation,
  operatorNow,
  operatorAccessTokenSchema,
  parseOperatorInput,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const reactivateSchema = z.object({
  clubId: uuidSchema,
  operatorAccessToken: operatorAccessTokenSchema,
  invokedFromApplicationRoute: z.boolean().optional(),
});

export async function reactivateClub(
  rawInput: z.input<typeof reactivateSchema> & {
    dependencies?: OperatorDependencies;
  },
) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(reactivateSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  const { actorId } = await assertOperator(
    input.operatorAccessToken,
    dependencies,
  );

  if (isContractSimulation(dependencies)) {
    return {
      clubId: input.clubId,
      lifecycle: "onboarding" as const,
      publicAccess: "preview" as const,
      contentRestored: true,
      requiresBillingBeforePublicLaunch: true,
      audited: true,
    };
  }

  const client = getOperatorClient(dependencies);
  const { data: club, error: clubError } = await client
    .schema("onzio")
    .from("clubs")
    .select("id,lifecycle,public_access,archived_at")
    .eq("id", input.clubId)
    .maybeSingle();
  if (clubError || !club) failContract("CLUB_NOT_FOUND");
  if (club.lifecycle !== "archived") failContract("CLUB_NOT_ARCHIVED");

  const { data: previousDomains, error: domainReadError } = await client
    .schema("onzio")
    .from("club_domains")
    .select("id,active")
    .eq("club_id", input.clubId)
    .eq("is_primary", true);
  if (domainReadError) {
    failContract("REACTIVATION_FAILED", domainReadError.message);
  }
  const updatedAt = operatorNow(dependencies).toISOString();
  const clubUpdate = await client
    .schema("onzio")
    .from("clubs")
    .update({
      lifecycle: "onboarding",
      public_access: "preview",
      archived_at: null,
      updated_at: updatedAt,
    })
    .eq("id", input.clubId)
    .eq("lifecycle", "archived");
  if (clubUpdate.error) {
    failContract("REACTIVATION_FAILED", clubUpdate.error.message);
  }

  const domainUpdate = await client
    .schema("onzio")
    .from("club_domains")
    .update({ active: true, updated_at: updatedAt })
    .eq("club_id", input.clubId)
    .eq("is_primary", true)
    .not("verified_at", "is", null);
  if (domainUpdate.error) {
    await client
      .schema("onzio")
      .from("clubs")
      .update({
        lifecycle: club.lifecycle,
        public_access: club.public_access,
        archived_at: club.archived_at,
      })
      .eq("id", input.clubId);
    failContract("REACTIVATION_FAILED", domainUpdate.error.message);
  }

  try {
    await writeOperatorAudit(client, {
      actorId,
      clubId: input.clubId,
      operation: "reactivate",
      resourceType: "club",
      resourceId: input.clubId,
      payload: { public_access: "preview" },
    });
  } catch (error) {
    await client
      .schema("onzio")
      .from("clubs")
      .update({
        lifecycle: club.lifecycle,
        public_access: club.public_access,
        archived_at: club.archived_at,
      })
      .eq("id", input.clubId);
    for (const domain of previousDomains ?? []) {
      await client
        .schema("onzio")
        .from("club_domains")
        .update({ active: domain.active })
        .eq("id", domain.id);
    }
    failContract(
      "REACTIVATION_AUDIT_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    clubId: input.clubId,
    lifecycle: "onboarding" as const,
    publicAccess: "preview" as const,
    contentRestored: true,
    requiresBillingBeforePublicLaunch: true,
    audited: true,
  };
}
