import { parseArgs } from "node:util";
import { packPilotSource, reconstructPilotSource, verifyPilotSource } from "./pilot-source-package";

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  output: { type: "string" }, build: { type: "string" }, package: { type: "string" }, digest: { type: "string" },
} });
const root = process.cwd();
switch (positionals.join(" ")) {
  case "pack":
    if (!values.output || !values.build) throw new Error("pack requires --build and --output");
    console.log(JSON.stringify(packPilotSource({ root, buildRoot: values.build, output: values.output })));
    break;
  case "verify":
    if (!values.package || !values.digest) throw new Error("verify requires --package and --digest");
    console.log(JSON.stringify({ digest: verifyPilotSource(values.package, values.digest).digest, verdict: "VERIFIED" }));
    break;
  case "reconstruct":
    if (!values.package || !values.digest || !values.output) throw new Error("reconstruct requires --package, --digest and --output");
    console.log(JSON.stringify(reconstructPilotSource({ root, directory: values.package, expectedDigest: values.digest, output: values.output })));
    break;
  default:
    throw new Error("Use pack, verify or reconstruct. This tool packages local files and never activates a site.");
}
