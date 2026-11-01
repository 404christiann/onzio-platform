import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { isPublicTenantPath } from "@/middleware";
import {
  academyHref,
  academyRoutes,
  matchAcademyRoute,
  type AcademyRouteId,
} from "@/components/sites/diverse-city/routes";

const root = process.cwd();
const adapters = resolve(root, "app/%5Fclubs/[slug]");
const siteModule = resolve(root, "components/sites/diverse-city");

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function implementedPatterns() {
  return walk(adapters)
    .filter((path) => path.endsWith(`${sep}page.tsx`))
    .map((path) => {
      const directory = relative(adapters, path).split(sep).slice(0, -1);
      return `/${directory.join("/")}`;
    })
    .sort();
}

const ids = Object.keys(academyRoutes) as AcademyRouteId[];
const uuid = "9c4a6f4e-1b2d-4c3e-8f5a-0123456789ab";
const samples: Record<AcademyRouteId, string> = {
  home: academyHref("home"),
  about: academyHref("about"),
  logo: academyHref("logo"),
  contact: academyHref("contact"),
  programs: academyHref("programs"),
  programDetail: academyHref("programDetail", { programSlug: "upsl-mens-teams" }),
  register: academyHref("register", { formSlug: "fall-2026" }),
  registerConfirmation: academyHref("registerConfirmation", { formSlug: "fall-2026" }),
  roster: academyHref("roster"),
  rosterPlayer: academyHref("rosterPlayer", { playerId: uuid }),
  schedule: academyHref("schedule"),
  scheduleFixture: academyHref("scheduleFixture", { fixtureId: uuid }),
  shop: academyHref("shop"),
  sponsors: academyHref("sponsors"),
  staff: academyHref("staff"),
  stats: academyHref("stats"),
  tryouts: academyHref("tryouts"),
};

describe("Academy route table", () => {
  it("lists exactly the pages the tenant adapters implement", () => {
    expect(ids.map((id) => academyRoutes[id].pattern).sort()).toEqual(implementedPatterns());
  });

  it("builds a destination that resolves back to its own route", () => {
    for (const id of ids) expect(matchAcademyRoute(samples[id])).toBe(id);
  });

  it("only names pages the tenant middleware admits on a club host", () => {
    for (const id of ids) expect(isPublicTenantPath(samples[id]), id).toBe(true);
  });

  it("matches the public path under either tenant prefix and rejects unimplemented paths", () => {
    expect(matchAcademyRoute("/_clubs/diverse-city/programs/upsl-mens-teams")).toBe("programDetail");
    expect(matchAcademyRoute("/%5Fclubs/diverse-city/")).toBe("home");
    expect(matchAcademyRoute("/schedule/")).toBe("schedule");
    for (const path of ["/standings", "/programs/a/b", "/club", "/register", "/admin"]) {
      expect(matchAcademyRoute(path)).toBeNull();
    }
  });
});

describe("Academy site module destinations", () => {
  it("names no internal destination outside the route table", () => {
    const violations: string[] = [];
    for (const path of walk(siteModule).filter((file) => /\.tsx?$/.test(file) && !file.endsWith(`${sep}routes.ts`))) {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const check = (node: ts.Node, text: string) => {
        if (text.startsWith("/") && !text.startsWith("/images/")) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart());
          violations.push(`${relative(root, path)}:${line + 1} ${JSON.stringify(text)}`);
        }
      };
      const checkHref = (node: ts.Node, text: string) => {
        if (!/^(?:https?:|mailto:|tel:)/.test(text)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart());
          violations.push(`${relative(root, path)}:${line + 1} href ${JSON.stringify(text)}`);
        }
      };
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text);
        else if (ts.isTemplateExpression(node)) check(node, node.head.text);
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "href" && node.initializer && ts.isStringLiteral(node.initializer)) {
          checkHref(node, node.initializer.text);
        }
        if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "href" && ts.isStringLiteral(node.initializer)) {
          checkHref(node, node.initializer.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
