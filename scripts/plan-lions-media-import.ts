import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  buildLionsMediaImportPlan,
  LIONS_SOURCE_BUCKET,
  LIONS_SOURCE_PREFIX,
  LIONS_SOURCE_PROJECT_REF,
  type LionsDestinationEnvironment,
  type LionsKnownAssetName,
  type LionsSourceAssetInput,
} from "@/lib/migration/lions-media-plan";

const DEFAULT_SOURCE_ROOT =
  "/Users/christianalcala/Downloads/lionsFCAssets";

const ASSET_FILES: Record<LionsKnownAssetName, string> = {
  "crest.png": "Logos/crest.png",
  "crest-white.png": "Logos/crest-white.png",
  "491417483_17927675355024475_5496002634953332765_n.jpg":
    "Slideshow/491417483_17927675355024475_5496002634953332765_n.jpg",
  "491499458_17927675328024475_7356353145949999522_n.jpg":
    "Slideshow/491499458_17927675328024475_7356353145949999522_n.jpg",
  "490753204_17927675316024475_6690706346505779685_n.jpg":
    "Slideshow/490753204_17927675316024475_6690706346505779685_n.jpg",
  "491452867_17927675298024475_4413570856070124753_n.jpg":
    "Slideshow/491452867_17927675298024475_4413570856070124753_n.jpg",
  "491413366_17927675394024475_4053105668658067411_n.jpg":
    "Slideshow/491413366_17927675394024475_4053105668658067411_n.jpg",
  "blue-jersey-transparent.png": "Jersey/blue-jersey-transparent.png",
  "red-jersey-transparent.png": "Jersey/red-jersey-transparent.png",
  "white-jersey-transparent.png": "Jersey/white-jersey-transparent.png",
};

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/plan-lions-media-import.ts \\",
    `    --source-project-ref ${LIONS_SOURCE_PROJECT_REF} \\`,
    `    --source-bucket ${LIONS_SOURCE_BUCKET} \\`,
    `    --source-prefix ${LIONS_SOURCE_PREFIX} \\`,
    "    --destination-environment staging \\",
    "    --confirm-environment staging \\",
    "    --tenant-id 11111111-1111-4111-8111-111111111111 \\",
    "    --source-root /absolute/path/to/local/lions/assets \\",
    "    --out docs/phase-9/lions-media-import-plan.json \\",
    "    --dry-run",
    "",
    "The planner reads local files only and performs no hosted Supabase mutations.",
  ].join("\n");
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}`);
    const key = arg.slice(2);
    if (key === "dry-run") {
      result[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    result[key] = value;
    index += 1;
  }
  return result;
}

function requireString(
  args: Record<string, string | boolean>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing --${key}`);
  }
  return value;
}

function assertEnvironment(value: string): LionsDestinationEnvironment {
  if (value === "local" || value === "staging" || value === "production") {
    return value;
  }
  throw new Error("Destination environment must be local, staging, or production.");
}

async function readAssets(sourceRoot: string): Promise<LionsSourceAssetInput[]> {
  const root = resolve(sourceRoot);
  if (!isAbsolute(root)) throw new Error("--source-root must be absolute.");
  return Promise.all(
    Object.entries(ASSET_FILES).map(async ([name, relativePath]) => ({
      name: name as LionsKnownAssetName,
      bytes: await readFile(resolve(root, relativePath)),
    })),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = requireString(args, "out");
  const destinationEnvironment = assertEnvironment(
    requireString(args, "destination-environment"),
  );
  const sourceRoot =
    typeof args["source-root"] === "string"
      ? args["source-root"]
      : DEFAULT_SOURCE_ROOT;
  const plan = await buildLionsMediaImportPlan({
    sourceProjectRef: requireString(args, "source-project-ref"),
    sourceBucket: requireString(args, "source-bucket"),
    sourcePrefix: requireString(args, "source-prefix"),
    destinationEnvironment,
    destinationTenantId: requireString(args, "tenant-id"),
    dryRun: args["dry-run"] === true,
    confirmedDestinationEnvironment: requireString(args, "confirm-environment"),
    assets: await readAssets(sourceRoot),
  });
  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(resolve(out), `${JSON.stringify(plan, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      dryRunOnly: plan.dryRunOnly,
      hostedMutations: plan.summary.hostedMutations,
      assets: plan.summary.plannedMediaAssetCount,
      blockedContentLinks: plan.summary.blockedContentLinkCount,
      out: resolve(out),
      planDigest: plan.planDigest,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exitCode = 1;
});
