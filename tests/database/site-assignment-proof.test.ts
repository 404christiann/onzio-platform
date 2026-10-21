import { it } from "vitest";
import { openProof } from "../helpers/site-assignment-proof";
import { exerciseAssignmentSql } from "../helpers/site-assignment-scenarios";

it("proves isolated assignment, rollback, tenant constraints and actual save interleavings", async () => {
  const proof = await openProof();
  try { await exerciseAssignmentSql(proof); }
  finally { await proof.close(); await proof.removeArtifacts(); }
}, 30000);
