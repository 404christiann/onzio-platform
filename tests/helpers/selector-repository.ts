import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll } from "vitest";
import { ALLOWLIST_PATH, canonicalSelectorJson, type SelectorTable } from "./template-selectors";

const PREFIX = "onzio-selector-regression-";
// The identity makes commits work without repository config. Disabling auto maintenance stops
// every `git commit` from starting a second `git maintenance run --auto` process.
const GIT_DEFAULTS = [
  "-c", "user.name=Selector Test",
  "-c", "user.email=selector@example.invalid",
  "-c", "maintenance.auto=false",
];

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", [...GIT_DEFAULTS, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Each git process takes 60 to 200 ms on a loaded Mac. Building the starting repository takes
// three of them, so a test file builds it once and every test copies the files.
let startingRepository: string | undefined;

function startingRepositoryPath(): string {
  if (startingRepository) return startingRepository;
  const dir = mkdtempSync(resolve(tmpdir(), `${PREFIX}start-`));
  runGit(dir, ["init", "--template="]);
  runGit(dir, ["commit", "--allow-empty", "-m", "before selector guard"]);
  runGit(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  startingRepository = dir;
  return dir;
}

afterAll(() => {
  if (startingRepository) rmSync(startingRepository, { recursive: true, force: true });
  startingRepository = undefined;
});

export function withSelectorRepository(
  run: (root: string, git: (...args: string[]) => string, save: (table: SelectorTable) => void) => void,
) {
  const root = mkdtempSync(resolve(tmpdir(), PREFIX));
  const git = (...args: string[]) => runGit(root, args);
  const save = (table: SelectorTable) => {
    mkdirSync(resolve(root, "tests/architecture"), { recursive: true });
    writeFileSync(resolve(root, ALLOWLIST_PATH), canonicalSelectorJson(table));
    git("add", ".");
    git("commit", "-m", "record selector inventory");
  };
  try {
    cpSync(startingRepositoryPath(), root, { recursive: true });
    run(root, git, save);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
