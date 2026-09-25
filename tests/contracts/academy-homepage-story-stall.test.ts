import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";

describe("academy homepage response", () => {
  it("does not wait for an optional story read when the hero is ready", async () => {
    const scopedClient = { from: vi.fn() };
    const hero = { headline_line_one: "Diverse City FC" };
    const getClub = vi.fn().mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Diverse City FC",
      presentationTemplateKey: "academy@1",
    });
    const createClient = vi.fn().mockResolvedValue({
      schema: vi.fn().mockReturnValue(scopedClient),
    });
    const fetchHero = vi.fn().mockResolvedValue(hero);
    const fetchStory = vi.fn().mockImplementation(() => new Promise(() => {}));

    // This route's encoded pathname is not parsed as TSX by Vitest's Vite
    // transform. Compile only this module and provide its dependencies.
    const page = readFileSync(resolve(process.cwd(), "app/%5Fclubs/[slug]/page.tsx"), "utf8");
    const compiled = ts.transpileModule(page, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const routeModule: { exports: { default?: (args: { params: Promise<{ slug: string }> }) => Promise<unknown> } } = {
      exports: {},
    };
    const modules: Record<string, unknown> = {
      "@/components/HomePageClient": { default: () => null },
      "@/lib/club-context": { getClubContextBySlug: getClub },
      "@/lib/queries": {
        fetchHomepageHeroContent: fetchHero,
        fetchHomepageStorySection: fetchStory,
      },
      "@/lib/supabase-server": { createClient },
      "react/jsx-runtime": { jsx: (_type: unknown, props: unknown) => ({ props }) },
    };
    runInNewContext(compiled, {
      module: routeModule,
      exports: routeModule.exports,
      require: (id: string) => modules[id],
      console,
    });

    const result = await Promise.race([
      routeModule.exports.default!({ params: Promise.resolve({ slug: "diverse-city" }) }),
      new Promise<"timed out">((resolve) => setTimeout(() => resolve("timed out"), 100)),
    ]);

    expect(result).not.toBe("timed out");
    expect(fetchHero).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      scopedClient,
    );
    expect(fetchStory).not.toHaveBeenCalled();
    expect(result).toMatchObject({ props: { initialHeroContent: hero } });
  });
});
