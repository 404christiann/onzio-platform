import { randomUUID } from "node:crypto";
import { archiveClub } from "@/lib/operator/archive-club";
import {
  addClubMembership,
  removeClubMembership,
} from "@/lib/operator/manage-membership";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";
import { provisionClub } from "@/lib/operator/provision-club";
import { purgeClub } from "@/lib/operator/purge-club";
import { reactivateClub } from "@/lib/operator/reactivate-club";
import { registerClubExport } from "@/lib/operator/register-club-export";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const OPERATOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const EXISTING_OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6";
const MEMBER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";

function requireLocalEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase environment is required");
  }
  const hostname = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`Refusing non-local Supabase host: ${hostname}`);
  }
  process.env.ONZIO_OPERATOR_USER_IDS = OPERATOR_ID;
}

async function main() {
  requireLocalEnvironment();
  const suffix = randomUUID().slice(0, 8);
  const slug = `operator-smoke-${suffix}`;
  const exportId = `export_${randomUUID()}`;
  const operatorAccessToken = await acquireOperatorAccessToken();

  const provisioned = await provisionClub({
    slug,
    name: "Operator Smoke FC",
    primaryDomain: `${slug}.localhost`,
    ownerEmail: "multiclub@local.test",
    operatorAccessToken,
    existingAuthUserId: EXISTING_OWNER_ID,
    environment: "staging",
  });

  await addClubMembership({
    clubId: provisioned.club.id,
    operatorAccessToken,
    userId: MEMBER_ID,
    userEmail: "unaffiliated@local.test",
    role: "admin",
  });
  await removeClubMembership({
    clubId: provisioned.club.id,
    operatorAccessToken,
    userId: MEMBER_ID,
  });
  await archiveClub({
    clubId: provisioned.club.id,
    operatorAccessToken,
    reason: "Local Phase 5 smoke",
  });
  await reactivateClub({
    clubId: provisioned.club.id,
    operatorAccessToken,
  });
  await archiveClub({
    clubId: provisioned.club.id,
    operatorAccessToken,
    reason: "Prepare local hard-purge smoke",
  });
  await registerClubExport({
    exportId,
    clubId: provisioned.club.id,
    operatorAccessToken,
    checksumSha256: "a".repeat(64),
    objectCount: 0,
    rowCount: 4,
    storageReference: `local-smoke://${exportId}`,
  });
  const purged = await purgeClub({
    clubId: provisioned.club.id,
    operatorAccessToken,
    exportId,
    confirmation: slug,
  });

  const client = createServiceRoleClient().schema("onzio");
  const { data: removedClub, error: clubError } = await client
    .from("clubs")
    .select("id")
    .eq("id", provisioned.club.id)
    .maybeSingle();
  if (clubError || removedClub) {
    throw new Error("Hard purge did not remove the synthetic smoke club");
  }

  const { data: finalAudit, error: auditError } = await client
    .from("audit_events")
    .select("club_id,operation,resource_id")
    .eq("operation", "hard_purge")
    .eq("resource_id", provisioned.club.id)
    .maybeSingle();
  if (auditError || finalAudit?.club_id !== null) {
    throw new Error("Hard purge audit did not survive outside tenant data");
  }

  console.log(
    JSON.stringify({
      event: "operator.workflow_smoke",
      provisioned: provisioned.committed,
      membershipRevoked: true,
      archivedAndReactivated: true,
      purged: purged.purged,
      finalAuditOutsideTenant: purged.finalAuditOutsideTenant,
      operatorSessionVerified: true,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
