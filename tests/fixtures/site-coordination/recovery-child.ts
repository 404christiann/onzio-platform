import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openCoordinationProof } from "../../helpers/site-coordination-proof";

assert(process.send, "Recovery fixture requires its parent IPC channel");
process.on("disconnect", () => process.exit(1));

function command(expected: "populate" | "close") {
  return new Promise<void>((resolve, reject) => {
    process.once("message", value => {
      if (typeof value === "object" && value !== null && "action" in value && value.action === expected) resolve();
      else reject(new Error("Unexpected recovery fixture command"));
    });
  });
}

let phase: "opening" | "populating" | "closing" = "opening";

async function run() {
  const proof = await openCoordinationProof({ cleanupStatementTimeoutMs: 8_000 });
  const populate = command("populate");
  process.send?.({ kind: "opened", recoveryFile: proof.recoveryFile, clubId: proof.clubId, schema: proof.schema });
  await populate;
  phase = "populating";
  await proof.populateAcademy();
  const close = command("close");
  process.send?.({ kind: "populated" });
  await close;
  phase = "closing";
  try {
    await proof.close();
    throw new Error("The parent lock did not interrupt cleanup");
  } catch (error) {
    assert(error instanceof Error && "code" in error && error.code === "57014", "Cleanup must fail at the real statement timeout");
    const journal = JSON.parse(await readFile(proof.recoveryFile, "utf8"));
    assert.equal(journal.stage, "cleanup-failed");
    process.send?.({ kind: "cleanup-failed", code: error.code }, () => process.exit(0));
  }
}

void run().catch((error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "UNKNOWN";
  process.send?.({ kind: "unexpected-failure", phase, code }, () => process.exit(1));
});
