import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  emailSchema,
  getOperatorClient,
  operatorNow,
  parseOperatorInput,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const addMembershipSchema = z.object({
  clubId: uuidSchema,
  actorId: uuidSchema,
  userId: uuidSchema,
  userEmail: emailSchema.optional(),
  role: z.enum(["owner", "admin"]),
  invokedFromApplicationRoute: z.boolean().optional(),
});

const removeMembershipSchema = z.object({
  clubId: uuidSchema,
  actorId: uuidSchema,
  userId: uuidSchema,
  invokedFromApplicationRoute: z.boolean().optional(),
});

export async function addClubMembership(
  rawInput: z.input<typeof addMembershipSchema> & {
    dependencies?: OperatorDependencies;
  },
) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(addMembershipSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  assertOperator(input.actorId);
  const client = getOperatorClient(dependencies);

  const { data: authUser, error: authError } =
    await client.auth.admin.getUserById(input.userId);
  if (authError || !authUser.user) failContract("AUTH_USER_NOT_FOUND");
  if (
    input.userEmail &&
    authUser.user.email?.toLowerCase() !== input.userEmail
  ) {
    failContract("AUTH_EMAIL_MISMATCH");
  }

  const { data: club, error: clubError } = await client
    .schema("onzio")
    .from("clubs")
    .select("id,lifecycle")
    .eq("id", input.clubId)
    .maybeSingle();
  if (clubError || !club) failContract("CLUB_NOT_FOUND");
  if (club.lifecycle === "archived") failContract("CLUB_ARCHIVED");

  const { data: previousMembership, error: previousError } = await client
    .schema("onzio")
    .from("club_members")
    .select("role,status,removed_at")
    .eq("club_id", input.clubId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (previousError) {
    failContract("MEMBERSHIP_MUTATION_FAILED", previousError.message);
  }

  const { error } = await client
    .schema("onzio")
    .from("club_members")
    .upsert(
      {
        club_id: input.clubId,
        user_id: input.userId,
        role: input.role,
        status: "active",
        removed_at: null,
        updated_at: operatorNow(dependencies).toISOString(),
      },
      { onConflict: "user_id,club_id" },
    );
  if (error) failContract("MEMBERSHIP_MUTATION_FAILED", error.message);

  try {
    await writeOperatorAudit(client, {
      actorId: input.actorId,
      clubId: input.clubId,
      operation: "membership_added",
      resourceType: "club_member",
      resourceId: input.userId,
      payload: { role: input.role },
    });
  } catch (error) {
    if (previousMembership) {
      await client
        .schema("onzio")
        .from("club_members")
        .update({
          role: previousMembership.role,
          status: previousMembership.status,
          removed_at: previousMembership.removed_at,
        })
        .eq("club_id", input.clubId)
        .eq("user_id", input.userId);
    } else {
      await client
        .schema("onzio")
        .from("club_members")
        .delete()
        .eq("club_id", input.clubId)
        .eq("user_id", input.userId);
    }
    failContract(
      "MEMBERSHIP_MUTATION_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    clubId: input.clubId,
    userId: input.userId,
    role: input.role,
    status: "active" as const,
    audited: true,
  };
}

export async function removeClubMembership(
  rawInput: z.input<typeof removeMembershipSchema> & {
    dependencies?: OperatorDependencies;
  },
) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(removeMembershipSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  assertOperator(input.actorId);
  const client = getOperatorClient(dependencies);

  const { data: membership, error: membershipError } = await client
    .schema("onzio")
    .from("club_members")
    .select("role,status,removed_at")
    .eq("club_id", input.clubId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (membershipError || !membership) failContract("MEMBERSHIP_REQUIRED");
  if (membership.status !== "active") failContract("MEMBERSHIP_INACTIVE");

  if (membership.role === "owner") {
    const { count, error: countError } = await client
      .schema("onzio")
      .from("club_members")
      .select("*", { count: "exact", head: true })
      .eq("club_id", input.clubId)
      .eq("role", "owner")
      .eq("status", "active");
    if (countError) {
      failContract("MEMBERSHIP_MUTATION_FAILED", countError.message);
    }
    if ((count ?? 0) <= 1) failContract("LAST_OWNER_REQUIRED");
  }

  const removedAt = operatorNow(dependencies).toISOString();
  const { error } = await client
    .schema("onzio")
    .from("club_members")
    .update({
      status: "removed",
      removed_at: removedAt,
      updated_at: removedAt,
    })
    .eq("club_id", input.clubId)
    .eq("user_id", input.userId)
    .eq("status", "active");
  if (error) failContract("MEMBERSHIP_MUTATION_FAILED", error.message);

  try {
    await writeOperatorAudit(client, {
      actorId: input.actorId,
      clubId: input.clubId,
      operation: "membership_removed",
      resourceType: "club_member",
      resourceId: input.userId,
      payload: { previous_role: membership.role },
    });
  } catch (error) {
    await client
      .schema("onzio")
      .from("club_members")
      .update({
        status: "active",
        removed_at: null,
        updated_at: operatorNow(dependencies).toISOString(),
      })
      .eq("club_id", input.clubId)
      .eq("user_id", input.userId);
    failContract(
      "MEMBERSHIP_MUTATION_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    clubId: input.clubId,
    userId: input.userId,
    status: "removed" as const,
    accessRevokedImmediately: true,
    audited: true,
  };
}
