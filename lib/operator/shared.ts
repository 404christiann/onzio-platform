import { createHash } from "node:crypto";
import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export type OperatorClient = ReturnType<typeof createServiceRoleClient>;

export type OperatorDependencies = {
  client?: OperatorClient;
  now?: () => Date;
};

export const uuidSchema = z.string().uuid();
export const slugSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const emailSchema = z.string().email().max(254).transform((email) =>
  email.trim().toLowerCase(),
);

export function parseOperatorInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    failContract("INVALID_OPERATOR_INPUT", result.error.issues[0]?.message);
  }
  return result.data;
}

export function isContractSimulation(
  dependencies: OperatorDependencies | undefined,
): boolean {
  return process.env.NODE_ENV === "test" && dependencies?.client === undefined;
}

export function getOperatorClient(
  dependencies: OperatorDependencies | undefined,
): OperatorClient {
  return dependencies?.client ?? createServiceRoleClient();
}

export function operatorNow(
  dependencies: OperatorDependencies | undefined,
): Date {
  return dependencies?.now?.() ?? new Date();
}

export function assertOperator(actorId: string): void {
  const configured = (process.env.ONZIO_OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configured.includes(actorId)) {
    failContract("OPERATOR_ONLY");
  }
}

export function assertDirectOperatorInvocation(
  invokedFromApplicationRoute: boolean | undefined,
): void {
  if (invokedFromApplicationRoute) failContract("OPERATOR_ONLY");
}

export function referenceDigest(reference: string): string {
  return createHash("sha256").update(reference, "utf8").digest("hex");
}

export async function writeOperatorAudit(
  client: OperatorClient,
  input: {
    actorId: string;
    clubId?: string | null;
    operation: string;
    resourceType: string;
    resourceId?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<number> {
  const { data, error } = await client
    .schema("onzio")
    .from("audit_events")
    .insert({
      club_id: input.clubId ?? null,
      actor_user_id: input.actorId,
      actor_type: "operator",
      operation: input.operation,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      payload: input.payload ?? {},
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Operator audit failed: ${error?.message ?? "missing row"}`);
  }
  return Number(data.id);
}

export function mapDatabaseConflict(error: {
  code?: string;
  message?: string;
}, fallback = "OPERATOR_MUTATION_FAILED"): never {
  const message = error.message ?? "";
  if (/clubs_slug_key|slug/i.test(message)) failContract("SLUG_CONFLICT");
  if (/club_domains.*hostname|environment.*hostname/i.test(message)) {
    failContract("DOMAIN_CONFLICT");
  }
  failContract(fallback, message);
}
