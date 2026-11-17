import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { recoverCoordinationProof } from "../tests/helpers/site-coordination-proof";

const { values } = parseArgs({ options: { recovery: { type: "string" } } });
if (!values.recovery) throw new Error("Use --recovery /absolute/path/to/recovery.json");
const recoveryFile = resolve(values.recovery);

void recoverCoordinationProof(recoveryFile).then(() => {
  console.log(JSON.stringify({ verdict: "VERIFIED-CLEAN", recoveryFile }));
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split("\n")[0] : "Recovery failed";
  console.error(message);
  process.exitCode = 1;
});
