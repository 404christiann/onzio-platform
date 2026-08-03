import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import { addClubMembership } from "@/lib/operator/manage-membership";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  emailSchema,
  getOperatorClient,
  isContractSimulation,
  parseOperatorInput,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const inviteClubMemberSchema = z.object({
  clubId: uuidSchema,
  actorId: uuidSchema,
  email: emailSchema,
  role: z.enum(["owner", "admin"]),
  environment: z.enum(["staging", "production"]),
  invokedFromApplicationRoute: z.boolean().optional(),
});

type InviteClubMemberDependencies = OperatorDependencies & {
  verifiedPrimaryHostname?: string;
  onStage?: (stage: string) => void;
};

export type InviteClubMemberInput = z.input<typeof inviteClubMemberSchema> & {
  dependencies?: InviteClubMemberDependencies;
};

async function assertEmailIsNew(
  client: ReturnType<typeof getOperatorClient>,
  email: string,
): Promise<void> {
  const perPage = 1_000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) failContract("AUTH_IDENTITY_LOOKUP_FAILED", error.message);
    if (data.users.some((user) => user.email?.toLowerCase() === email)) {
      failContract("AUTH_IDENTITY_EXISTS");
    }
    if (data.users.length < perPage) return;
  }
}

async function resolveVerifiedCallback(
  client: ReturnType<typeof getOperatorClient>,
  clubId: string,
  environment: "staging" | "production",
): Promise<string> {
  const { data: club, error: clubError } = await client
    .schema("onzio")
    .from("clubs")
    .select("id,lifecycle")
    .eq("id", clubId)
    .maybeSingle();
  if (clubError || !club) failContract("CLUB_NOT_FOUND");
  if (club.lifecycle === "archived") failContract("CLUB_ARCHIVED");

  const { data: domain, error: domainError } = await client
    .schema("onzio")
    .from("club_domains")
    .select("hostname")
    .eq("club_id", clubId)
    .eq("environment", environment)
    .eq("is_primary", true)
    .eq("active", true)
    .not("verified_at", "is", null)
    .maybeSingle();
  if (domainError || !domain) failContract("VERIFIED_PRIMARY_DOMAIN_REQUIRED");

  return new URL("/admin/auth/callback", `https://${domain.hostname}`).toString();
}

export async function inviteClubMember(rawInput: InviteClubMemberInput) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(inviteClubMemberSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);

  if (isContractSimulation(dependencies)) {
    const hostname = dependencies?.verifiedPrimaryHostname ?? "club.example";
    return {
      clubId: input.clubId,
      role: input.role,
      callbackUrl: new URL(
        "/admin/auth/callback",
        `https://${hostname}`,
      ).toString(),
      authUserCreated: true,
      invitationRequested: true,
      membershipActive: true,
      audited: true,
    };
  }

  assertOperator(input.actorId);
  dependencies?.onStage?.("operator_authorized");
  const client = getOperatorClient(dependencies);
  dependencies?.onStage?.("client_ready");
  await assertEmailIsNew(client, input.email);
  dependencies?.onStage?.("email_absent");
  const callbackUrl = await resolveVerifiedCallback(
    client,
    input.clubId,
    input.environment,
  );
  dependencies?.onStage?.("callback_verified");

  dependencies?.onStage?.("invitation_request_started");
  const { data: invitation, error: invitationError } =
    await client.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: callbackUrl,
    });
  if (invitationError || !invitation.user) {
    failContract("AUTH_INVITATION_FAILED", invitationError?.message);
  }
  dependencies?.onStage?.("invitation_created");

  const invitedUserId = invitation.user.id;
  try {
    await addClubMembership({
      clubId: input.clubId,
      actorId: input.actorId,
      userId: invitedUserId,
      userEmail: input.email,
      role: input.role,
      dependencies,
    });
    dependencies?.onStage?.("membership_active");

    await writeOperatorAudit(client, {
      actorId: input.actorId,
      clubId: input.clubId,
      operation: "identity_invited",
      resourceType: "auth_user",
      resourceId: invitedUserId,
      payload: {
        environment: input.environment,
        role: input.role,
        recipient_domain: input.email.split("@")[1],
      },
    });
    dependencies?.onStage?.("audit_recorded");
  } catch (error) {
    const membershipCleanup = await client
      .schema("onzio")
      .from("club_members")
      .delete()
      .eq("club_id", input.clubId)
      .eq("user_id", invitedUserId);
    const authCleanup = await client.auth.admin.deleteUser(invitedUserId, false);
    if (membershipCleanup.error || authCleanup.error) {
      failContract(
        "AUTH_INVITATION_CLEANUP_FAILED",
        membershipCleanup.error?.message ?? authCleanup.error?.message,
      );
    }
    try {
      await writeOperatorAudit(client, {
        actorId: input.actorId,
        clubId: input.clubId,
        operation: "identity_invitation_rolled_back",
        resourceType: "auth_user",
        resourceId: invitedUserId,
        payload: { environment: input.environment, role: input.role },
      });
    } catch {
      // Cleanup succeeded; the original failure remains the actionable result.
    }
    failContract(
      "AUTH_INVITATION_ROLLED_BACK",
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    clubId: input.clubId,
    userId: invitedUserId,
    role: input.role,
    callbackUrl,
    authUserCreated: true,
    invitationRequested: true,
    membershipActive: true,
    audited: true,
  };
}
