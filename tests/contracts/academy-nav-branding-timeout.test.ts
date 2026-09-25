import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

const navSource = readFileSync(resolve(process.cwd(), "components/Nav.tsx"), "utf8");

// The contract runner uses Node and cannot import this client TSX component.
// Transpile and execute the actual timer helpers from its TypeScript AST.
function navFallbackHelpers() {
  const sourceFile = ts.createSourceFile("Nav.tsx", navSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set([
    "ACADEMY_PROGRAMS_FALLBACK_MS",
    "loadAcademyNavPrograms",
  ]);
  const statements = sourceFile.statements.filter((statement) => {
    if (ts.isFunctionDeclaration(statement)) return names.has(statement.name?.text ?? "");
    return ts.isVariableStatement(statement) && statement.declarationList.declarations.some(
      (declaration) => ts.isIdentifier(declaration.name) && names.has(declaration.name.text),
    );
  });
  expect(statements).toHaveLength(2);
  const output = ts.transpileModule(statements.map((statement) => statement.getText(sourceFile)).join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  new Function("exports", output)(exports);
  return exports as {
    ACADEMY_PROGRAMS_FALLBACK_MS: number;
    loadAcademyNavPrograms: (
      load: () => Promise<unknown[]>,
      onReady: (programs: unknown[]) => void,
      onUnavailable: () => void,
    ) => () => void;
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("academy navbar client fallbacks", () => {
  it("renders real navigation immediately while branding retries", () => {
    expect(navSource).toContain('clubLogoUrl || (isAcademy && brandingPending ? "/club-logo" : "")');
    expect(navSource).toContain("fallback={<span");
    expect(navSource).toContain("club.name.split(/\\s+/).map((part) => part[0]).join(\"\").slice(0, 3)");
    expect(navSource).toContain("loadingAppearance || pageLoading");
    expect(navSource).not.toContain("AcademyNavLoadingSkeleton");
    expect(navSource).not.toContain("brandingTimedOut");
  });

  it("restores transparent hero navigation after the loading surface leaves", () => {
    expect(navSource).toContain('document.querySelector("[data-academy-page-loading]")');
    expect(navSource).toContain("observer.observe(document.body, { childList: true, subtree: true })");
    expect(navSource).toContain("return () => observer.disconnect()");
  });

  it("keeps pending Programs readable against both dropdown backgrounds", () => {
    expect(navSource).toContain('isHero ? "text-white/80" : "text-[#51667E]"');
    expect(navSource).toContain('isHero ? "border-white/35 border-t-white" : "border-[#cad8e3] border-t-[#426c88]"');
  });

  it("settles a stalled Programs dropdown and accepts a late successful response", async () => {
    const { ACADEMY_PROGRAMS_FALLBACK_MS, loadAcademyNavPrograms } = navFallbackHelpers();
    vi.useFakeTimers();
    let resolvePrograms!: (programs: unknown[]) => void;
    const load = () => new Promise<unknown[]>((resolve) => { resolvePrograms = resolve; });
    const onReady = vi.fn();
    const onUnavailable = vi.fn();
    loadAcademyNavPrograms(load, onReady, onUnavailable);

    vi.advanceTimersByTime(ACADEMY_PROGRAMS_FALLBACK_MS - 1);
    expect(onUnavailable).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(onReady).not.toHaveBeenCalled();

    const programs = [{ slug: "mens-teams" }];
    resolvePrograms(programs);
    await Promise.resolve();
    expect(onReady).toHaveBeenCalledWith(programs);
    expect(navSource).toContain('setProgramsState("error")');
    expect(navSource).toContain('setProgramsState("ready")');
    expect(navSource).toContain('"Programs unavailable"');
  });

  it("ignores a Programs response after unmount and clears its timer", async () => {
    const { ACADEMY_PROGRAMS_FALLBACK_MS, loadAcademyNavPrograms } = navFallbackHelpers();
    vi.useFakeTimers();
    let resolvePrograms!: (programs: unknown[]) => void;
    const load = () => new Promise<unknown[]>((resolve) => { resolvePrograms = resolve; });
    const onReady = vi.fn();
    const onUnavailable = vi.fn();
    const cancel = loadAcademyNavPrograms(load, onReady, onUnavailable);
    cancel();

    vi.advanceTimersByTime(ACADEMY_PROGRAMS_FALLBACK_MS);
    resolvePrograms([{ slug: "mens-teams" }]);
    await Promise.resolve();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });
});
