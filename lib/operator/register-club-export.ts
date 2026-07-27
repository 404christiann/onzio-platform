import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  getOperatorClient,
  parseOperatorInput,
  type OperatorDependencies,
  uuidSchema,
} from "@/lib/operator/shared";

const exportSchema = z.object({
  exportId: z.string().trim().min(1).max(200),
  clubId: uuidSchema,
  actorId: uuidSchema,
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
  objectCount: z.number().int().nonnegative(),
  rowCount: z.number().int().nonnegative(),
  storageReference: z.string().trim().min(1).max(500),
  invokedFromApplicationRoute: z.boolean().optional(),
});

export async function registerClubExport(
  rawInput: z.input<typeof exportSchema> & {
    dependencies?: OperatorDependencies;
  },
) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(exportSchema, rawInput);
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  assertOperator(input.actorId);
  const client = getOperatorClient(dependencies);

  const { data: club, error: clubError } = await client
    .schema("onzio")
    .from("clubs")
    .select("id,slug,lifecycle")
    .eq("id", input.clubId)
    .maybeSingle();
  if (clubError || !club) failContract("CLUB_NOT_FOUND");
  if (club.lifecycle !== "archived") failContract("CLUB_NOT_ARCHIVED");

  const { error } = await client.schema("onzio").from("club_exports").insert({
    id: input.exportId,
    club_id: input.clubId,
    club_slug: club.slug,
    status: "verified",
    checksum_sha256: input.checksumSha256,
    object_count: input.objectCount,
    row_count: input.rowCount,
    storage_reference: input.storageReference,
    created_by: input.actorId,
  });
  if (error) failContract("EXPORT_REGISTRATION_FAILED", error.message);

  return {
    exportId: input.exportId,
    clubId: input.clubId,
    status: "verified" as const,
  };
}
