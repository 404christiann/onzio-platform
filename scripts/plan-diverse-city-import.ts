import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildDiverseCityImportPlan,
  DIVERSE_CITY_LOCAL_TENANT_ID,
  DIVERSE_CITY_SOURCE_COMMIT,
  type DiverseCityKnownAssetPath,
} from "@/lib/migration/diverse-city-plan";

const DEFAULT_SOURCE_ROOT =
  "/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site/public";
const DEFAULT_OUT = resolve(
  "docs/phase-11/diverse-city/diverse-city-local-import-plan.json",
);

export const DIVERSE_CITY_ASSET_FILES: DiverseCityKnownAssetPath[] = [
  "media/about-team-lineup.webp",
  "media/crest.png",
  "media/hero.webp",
  "media/programs/mens-teams-detail.webp",
  "media/programs/mens-teams-hero.webp",
  "media/programs/special-kickers-hero.webp",
  "media/programs/special-olympics-hero.webp",
  "media/shop/back_jersey.png",
  "media/shop/front_jersey.png",
  "media/sponsors/elsas-bakery.webp",
];

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
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = typeof args["source-root"] === "string"
    ? resolve(args["source-root"])
    : DEFAULT_SOURCE_ROOT;
  const out = typeof args.out === "string" ? resolve(args.out) : DEFAULT_OUT;
  const plan = await buildDiverseCityImportPlan({
    sourceCommit: typeof args["source-commit"] === "string"
      ? args["source-commit"]
      : DIVERSE_CITY_SOURCE_COMMIT,
    destinationEnvironment: "local",
    destinationTenantId: typeof args["tenant-id"] === "string"
      ? args["tenant-id"]
      : DIVERSE_CITY_LOCAL_TENANT_ID,
    confirmedDestinationEnvironment: typeof args["confirm-environment"] === "string"
      ? args["confirm-environment"]
      : "local",
    dryRun: args["dry-run"] === true,
    assets: await Promise.all(
      DIVERSE_CITY_ASSET_FILES.map(async (path) => ({
        path,
        bytes: await readFile(resolve(sourceRoot, path)),
      })),
    ),
  });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    out,
    planDigest: plan.planDigest,
    retainedAssets: plan.summary.retainedAssetCount,
    excludedAssets: plan.summary.excludedAssetCount,
    hostedMutations: 0,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
