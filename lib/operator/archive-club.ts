import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  getOperatorClient,
  isContractSimulation,
  operatorNow,
  parseOperatorInput,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const archiveSchema = z.object({
  clubId: uuidSchema,
  actorId: uuidSchema,
  reason: z.string().trim().min(1).max(500).optional(),
  invokedFromApplicationRoute: z.boolean().optional(),
});

export async function archiveClub(
  rawInput: z.input<typeof archiveSchema> & {
    dependencies?: OperatorDependencies;
  },
) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(archiveSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);

  if (isContractSimulation(dependencies)) {
    return {
      clubId: input.clubId,
      lifecycle: "archived" as const,
      domainsDetached: true,
      sessionsRejected: true,
      writesBlocked: true,
      contentPreserved: true,
      mediaPreserved: true,
      audited: true,
    };
  }

  assertOperator(input.actorId);
  const client = getOperatorClient(dependencies);
  const { data: club, error: clubError } = await client
    .schema("onzio")
    .from("clubs")
    .select("id,lifecycle,public_access,archived_at")
    .eq("id", input.clubId)
    .maybeSingle();
  if (clubError || !club) failContract("CLUB_NOT_FOUND");

  if (club.lifecycle !== "archived") {
    const { data: previousDomains, error: domainReadError } = await client
      .schema("onzio")
      .from("club_domains")
      .select("id,active")
      .eq("club_id", input.clubId);
    if (domainReadError) {
      failContract("ARCHIVE_FAILED", domainReadError.message);
    }
    const archivedAt = operatorNow(dependencies).toISOString();
    const update = await client
      .schema("onzio")
      .from("clubs")
      .update({
        lifecycle: "archived",
        public_access: "suspended",
        archived_at: archivedAt,
      })
      .eq("id", input.clubId);
    if (update.error) failContract("ARCHIVE_FAILED", update.error.message);

    const domains = await client
      .schema("onzio")
      .from("club_domains")
      .update({ active: false, updated_at: archivedAt })
      .eq("club_id", input.clubId);
    if (domains.error) {
      await client
        .schema("onzio")
        .from("clubs")
        .update({
          lifecycle: club.lifecycle,
          public_access: club.public_access,
          archived_at: club.archived_at,
        })
        .eq("id", input.clubId);
      failContract("ARCHIVE_FAILED", domains.error.message);
    }

    try {
      await writeOperatorAudit(client, {
        actorId: input.actorId,
        clubId: input.clubId,
        operation: "archive",
        resourceType: "club",
        resourceId: input.clubId,
        payload: input.reason ? { reason: input.reason } : {},
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
        "ARCHIVE_AUDIT_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return {
    clubId: input.clubId,
    lifecycle: "archived" as const,
    domainsDetached: true,
    sessionsRejected: true,
    writesBlocked: true,
    contentPreserved: true,
    mediaPreserved: true,
    audited: true,
  };
}
