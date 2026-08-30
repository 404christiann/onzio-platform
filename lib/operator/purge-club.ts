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
  type OperatorClient,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const purgeSchema = z.object({
  clubId: uuidSchema,
  operatorAccessToken: operatorAccessTokenSchema,
  exportId: z.string().trim().min(1).max(200).nullable(),
  confirmation: z.string().trim().min(1).max(63),
  invokedFromApplicationRoute: z.boolean().optional(),
});

const CHILD_TABLES = [
  "player_photos",
  "player_match_stats",
  "goalkeeper_match_stats",
  "player_season_stats",
  "goalkeeper_season_stats",
  "homepage_slideshow_photos",
  "league_standings",
  "shop_kit_photos",
  "shop_carousel_photos",
] as const;

const CONTENT_TABLES = [
  "players",
  "staff",
  "matches",
  "seasons",
  "site_branding",
  "site_social_links",
  "site_sponsor_logos",
  "about_page_content",
  "club_logo_page_content",
  "behind_the_rose_section",
  "homepage_slideshow_settings",
  "league_standings_settings",
  "shop_kit_section",
  "shop_purchase_details",
] as const;

async function listStoragePaths(
  client: OperatorClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) failContract("PURGE_STORAGE_FAILED", error.message);
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...(await listStoragePaths(client, bucket, path)));
      } else {
        paths.push(path);
      }
    }
    if (entries.length < 1000) break;
    offset += entries.length;
  }

  return paths;
}

async function removeStorage(client: OperatorClient, clubId: string) {
  for (const bucket of ["onzio-upload-staging", "onzio-media"] as const) {
    const paths = await listStoragePaths(client, bucket, clubId);
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await client.storage
        .from(bucket)
        .remove(paths.slice(index, index + 100));
      if (error) failContract("PURGE_STORAGE_FAILED", error.message);
    }
  }
}

async function deleteClubRows(
  client: OperatorClient,
  table: string,
  clubId: string,
) {
  const { error } = await client
    .schema("onzio")
    .from(table)
    .delete()
    .eq("club_id", clubId);
  if (error) failContract("PURGE_DATABASE_FAILED", `${table}: ${error.message}`);
}

export async function purgeClub(
  rawInput: z.input<typeof purgeSchema> & {
    dependencies?: OperatorDependencies;
  },
) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(purgeSchema, rawInput);

  if (!input.exportId) failContract("EXPORT_REQUIRED");
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  const { actorId } = await assertOperator(
    input.operatorAccessToken,
    dependencies,
  );

  if (isContractSimulation(dependencies)) {
    if (input.confirmation !== "alpha") {
      failContract("CONFIRMATION_MISMATCH");
    }
    return {
      purged: true,
      finalAuditOutsideTenant: true,
    };
  }

  const client = getOperatorClient(dependencies);
  const { data: club, error: clubError } = await client
    .schema("onzio")
    .from("clubs")
    .select("id,slug,lifecycle")
    .eq("id", input.clubId)
    .maybeSingle();
  if (clubError || !club) failContract("CLUB_NOT_FOUND");
  if (input.confirmation !== club.slug) failContract("CONFIRMATION_MISMATCH");
  if (club.lifecycle !== "archived") failContract("CLUB_NOT_ARCHIVED");

  const { data: exportRecord, error: exportError } = await client
    .schema("onzio")
    .from("club_exports")
    .select("id,club_id,status,checksum_sha256")
    .eq("id", input.exportId)
    .eq("club_id", input.clubId)
    .eq("status", "verified")
    .maybeSingle();
  if (exportError || !exportRecord) failContract("EXPORT_REQUIRED");

  await removeStorage(client, input.clubId);

  for (const table of CHILD_TABLES) {
    await deleteClubRows(client, table, input.clubId);
  }
  for (const table of CONTENT_TABLES) {
    await deleteClubRows(client, table, input.clubId);
  }
  for (const table of [
    "media_cleanup_queue",
    "media_assets",
    "club_subscriptions",
    "club_members",
    "club_domains",
  ]) {
    await deleteClubRows(client, table, input.clubId);
  }

  const clubDelete = await client
    .schema("onzio")
    .from("clubs")
    .delete()
    .eq("id", input.clubId)
    .eq("lifecycle", "archived");
  if (clubDelete.error) {
    failContract("PURGE_DATABASE_FAILED", clubDelete.error.message);
  }

  const purgedAt = operatorNow(dependencies).toISOString();
  const exportUpdate = await client
    .schema("onzio")
    .from("club_exports")
    .update({ status: "purged", purged_at: purgedAt })
    .eq("id", input.exportId);
  if (exportUpdate.error) {
    failContract("PURGE_FINALIZATION_FAILED", exportUpdate.error.message);
  }

  await writeOperatorAudit(client, {
    actorId,
    clubId: null,
    operation: "hard_purge",
    resourceType: "purged_club",
    resourceId: input.clubId,
    payload: {
      club_slug: club.slug,
      export_id: input.exportId,
      export_checksum: exportRecord.checksum_sha256,
    },
  });

  return {
    clubId: input.clubId,
    purged: true,
    exportId: input.exportId,
    finalAuditOutsideTenant: true,
  };
}
