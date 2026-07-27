import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  getOperatorClient,
  parseOperatorInput,
  referenceDigest,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const recoverySchema = z.object({
  clubId: uuidSchema,
  userId: uuidSchema,
  actorId: uuidSchema,
  identityVerified: z.literal(true),
  verificationReference: z.string().trim().min(8).max(500),
  redirectTo: z.string().url().optional(),
  invokedFromApplicationRoute: z.boolean().optional(),
});

export async function recoverMemberMfa(
  rawInput: z.input<typeof recoverySchema> & {
    dependencies?: OperatorDependencies;
  },
) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(recoverySchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  assertOperator(input.actorId);
  const client = getOperatorClient(dependencies);

  const { data: membership, error: membershipError } = await client
    .schema("onzio")
    .from("club_members")
    .select("status")
    .eq("club_id", input.clubId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (membershipError || !membership) failContract("MEMBERSHIP_REQUIRED");
  if (membership.status !== "active") failContract("MEMBERSHIP_INACTIVE");

  const { data: authUser, error: authError } =
    await client.auth.admin.getUserById(input.userId);
  if (authError || !authUser.user?.email) failContract("AUTH_USER_NOT_FOUND");

  const verificationDigest = referenceDigest(input.verificationReference);
  await writeOperatorAudit(client, {
    actorId: input.actorId,
    clubId: input.clubId,
    operation: "mfa_recovery_started",
    resourceType: "club_member",
    resourceId: input.userId,
    payload: { verification_reference_sha256: verificationDigest },
  });

  const { data: factors, error: factorsError } =
    await client.auth.admin.mfa.listFactors({ userId: input.userId });
  if (factorsError) {
    failContract("MFA_RECOVERY_FAILED", factorsError.message);
  }

  let removedFactors = 0;
  for (const factor of factors.factors) {
    const { error } = await client.auth.admin.mfa.deleteFactor({
      userId: input.userId,
      id: factor.id,
    });
    if (error) failContract("MFA_RECOVERY_FAILED", error.message);
    removedFactors += 1;
  }

  const { data: recovery, error: recoveryError } =
    await client.auth.admin.generateLink({
      type: "recovery",
      email: authUser.user.email,
      options: input.redirectTo ? { redirectTo: input.redirectTo } : undefined,
    });
  if (recoveryError) {
    failContract("MFA_RECOVERY_FAILED", recoveryError.message);
  }

  await writeOperatorAudit(client, {
    actorId: input.actorId,
    clubId: input.clubId,
    operation: "mfa_recovery_completed",
    resourceType: "club_member",
    resourceId: input.userId,
    payload: {
      factors_removed: removedFactors,
      verification_reference_sha256: verificationDigest,
    },
  });

  return {
    clubId: input.clubId,
    userId: input.userId,
    factorsRemoved: removedFactors,
    passwordRecoveryLink: recovery.properties?.action_link,
    requiresMfaEnrollment: true,
    audited: true,
  };
}
