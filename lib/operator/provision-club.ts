import { randomUUID } from "node:crypto";
import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import { normalizeHostname } from "@/lib/tenant";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  emailSchema,
  getOperatorClient,
  isContractSimulation,
  mapDatabaseConflict,
  operatorNow,
  parseOperatorInput,
  slugSchema,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const provisionSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  primaryDomain: z.string().min(1).max(253),
  ownerEmail: emailSchema,
  actorId: uuidSchema,
  existingAuthUserId: uuidSchema.optional(),
  environment: z.enum(["staging", "production"]).optional(),
  redirectTo: z.string().url().optional(),
  invokedFromApplicationRoute: z.boolean().optional(),
  existingSlug: z.boolean().optional(),
  existingDomain: z.boolean().optional(),
  simulateMembershipFailure: z.boolean().optional(),
});

export type ProvisionClubInput = z.input<typeof provisionSchema> & {
  dependencies?: OperatorDependencies;
};

type CreatedAuthUser = {
  id: string;
  created: boolean;
  actionLink?: string;
};

async function resolveOwner(
  input: z.output<typeof provisionSchema>,
  dependencies: OperatorDependencies | undefined,
): Promise<CreatedAuthUser> {
  const client = getOperatorClient(dependencies);
  if (input.existingAuthUserId) {
    const { data, error } = await client.auth.admin.getUserById(
      input.existingAuthUserId,
    );
    if (error || !data.user) failContract("AUTH_USER_NOT_FOUND");
    if (data.user.email?.toLowerCase() !== input.ownerEmail) {
      failContract("AUTH_EMAIL_MISMATCH");
    }
    return { id: data.user.id, created: false };
  }

  const { data, error } = await client.auth.admin.generateLink({
    type: "invite",
    email: input.ownerEmail,
    options: input.redirectTo ? { redirectTo: input.redirectTo } : undefined,
  });
  if (error || !data.user) {
    failContract("AUTH_PROVISIONING_FAILED", error?.message);
  }
  return {
    id: data.user.id,
    created: true,
    actionLink: data.properties?.action_link,
  };
}

async function rollbackProvisioning(
  client: ReturnType<typeof getOperatorClient>,
  clubId: string,
  authUser: CreatedAuthUser | null,
): Promise<void> {
  await client
    .schema("onzio")
    .from("audit_events")
    .delete()
    .eq("club_id", clubId);
  await client
    .schema("onzio")
    .from("club_members")
    .delete()
    .eq("club_id", clubId);
  await client
    .schema("onzio")
    .from("club_domains")
    .delete()
    .eq("club_id", clubId);
  await client.schema("onzio").from("clubs").delete().eq("id", clubId);
  if (authUser?.created) {
    await client.auth.admin.deleteUser(authUser.id, false);
  }
}

export async function provisionClub(rawInput: ProvisionClubInput) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(provisionSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  const hostname = normalizeHostname(input.primaryDomain);

  if (input.existingSlug) failContract("SLUG_CONFLICT");
  if (input.existingDomain) failContract("DOMAIN_CONFLICT");
  if (input.simulateMembershipFailure) {
    failContract("PROVISIONING_ROLLED_BACK");
  }

  if (isContractSimulation(dependencies)) {
    return {
      club: {
        id: randomUUID(),
        slug: input.slug,
        name: input.name,
        lifecycle: "onboarding" as const,
        publicAccess: "preview" as const,
      },
      domain: {
        hostname,
        primary: true,
        verified: true,
      },
      owner: {
        email: input.ownerEmail,
        role: "owner" as const,
        userId: input.existingAuthUserId ?? randomUUID(),
        authUserCreated: input.existingAuthUserId === undefined,
      },
      public: false,
      committed: true,
    };
  }

  assertOperator(input.actorId);
  const client = getOperatorClient(dependencies);
  const clubId = randomUUID();
  const now = operatorNow(dependencies).toISOString();
  const environment =
    input.environment ??
    (process.env.ONZIO_ENVIRONMENT === "production"
      ? "production"
      : "staging");
  let authUser: CreatedAuthUser | null = null;

  try {
    authUser = await resolveOwner(input, dependencies);

    const clubInsert = await client.schema("onzio").from("clubs").insert({
      id: clubId,
      slug: input.slug,
      name: input.name,
      lifecycle: "onboarding",
      public_access: "preview",
      tier: "starter",
    });
    if (clubInsert.error) mapDatabaseConflict(clubInsert.error);

    const domainInsert = await client.schema("onzio").from("club_domains").insert({
      club_id: clubId,
      hostname,
      is_primary: true,
      verified_at: now,
      environment,
      active: true,
    });
    if (domainInsert.error) mapDatabaseConflict(domainInsert.error);

    const membershipInsert = await client
      .schema("onzio")
      .from("club_members")
      .insert({
        club_id: clubId,
        user_id: authUser.id,
        role: "owner",
        status: "active",
      });
    if (membershipInsert.error) {
      failContract("PROVISIONING_ROLLED_BACK", membershipInsert.error.message);
    }

    await writeOperatorAudit(client, {
      actorId: input.actorId,
      clubId,
      operation: "provision",
      resourceType: "club",
      resourceId: clubId,
      payload: {
        environment,
        owner_user_id: authUser.id,
        primary_domain: hostname,
      },
    });

    return {
      club: {
        id: clubId,
        slug: input.slug,
        name: input.name,
        lifecycle: "onboarding" as const,
        publicAccess: "preview" as const,
      },
      domain: { hostname, primary: true, verified: true },
      owner: {
        email: input.ownerEmail,
        role: "owner" as const,
        userId: authUser.id,
        authUserCreated: authUser.created,
        ...(authUser.actionLink ? { passwordSetupLink: authUser.actionLink } : {}),
      },
      public: false,
      committed: true,
    };
  } catch (error) {
    await rollbackProvisioning(client, clubId, authUser);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error
    ) {
      throw error;
    }
    failContract(
      "PROVISIONING_ROLLED_BACK",
      error instanceof Error ? error.message : String(error),
    );
  }
}
