import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import AcademyAboutPage from "@/components/sites/diverse-city/AcademyAboutPage";
import type { ClubContext } from "@/lib/club-context";
import { isAboutContentDestination } from "@/lib/about-editor/content-policy";
import fixture from "../browser/site07-about-populated-fixture.json";

const club: ClubContext = {
  id: fixture.club_id, slug: "alpha", name: "Alpha FC", primaryDomain: "alpha.localhost",
  lifecycle: "active", publicAccess: "live", kind: "test", stripePriceId: null,
  tier: "pro", role: null, primaryColor: null, secondaryColor: null,
  presentationTemplateKey: "academy@1", storeEnabled: true,
};

describe("populated Academy About content", () => {
  it("renders the authored story, values, and finite CTA destination in the shared page", () => {
    const html = renderToStaticMarkup(createElement(ClubContextProvider, {
      club,
      children: createElement(AcademyAboutPage, { content: fixture, animate: false }),
    }));
    for (const text of ["Maintained club", "Our story", "Values", "Together", "Everyone belongs", "Join us", "Learn more"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="/contact"');
    expect(isAboutContentDestination(fixture.closing_cta_href)).toBe(true);
    expect(html).not.toContain("<img");
  });

  it("limits the server fixture to the exact Alpha read and rejects hosted requests and writes", () => {
    const preload = resolve(process.cwd(), "tests/browser/site07-about-populated-preload.cjs");
    const result = spawnSync(process.execPath, ["-e", `
      const assert = require("node:assert/strict");
      let forwarded = 0;
      globalThis.fetch = async (input, init) => {
        assert.equal(init.redirect, "manual");
        forwarded++;
        if (String(input).includes("redirect_fixture")) {
          return new Response(null, { status: 302, headers: { location: "https://hosted.example" } });
        }
        return Response.json([]);
      };
      require(${JSON.stringify(preload)});
      (async () => {
        const exact = "http://127.0.0.1:54321/rest/v1/about_page_content?select=*&club_id=eq.11111111-1111-4111-8111-111111111111&limit=1";
        assert.equal((await (await fetch(exact)).json())[0].hero_title, "Maintained club");
        assert.equal(forwarded, 0);
        await fetch(exact.replace("eq.11111111-1111-4111-8111-111111111111", "eq.22222222-2222-4222-8222-222222222222"));
        assert.equal(forwarded, 1);
        await assert.rejects(fetch(exact, { method: "POST" }), /loopback read/);
        await assert.rejects(fetch(exact.replace("127.0.0.1:54321", "hosted.example")), /loopback read/);
        assert.equal(forwarded, 1);
        await assert.rejects(fetch("http://127.0.0.1:54321/redirect_fixture"), /does not follow redirects/);
        assert.equal(forwarded, 2);
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `], { env: { NODE_ENV: "test", SITE07_ABOUT_POPULATED_FIXTURE: "1" }, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
});
