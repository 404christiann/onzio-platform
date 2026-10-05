import { expect, test, type Page } from "@playwright/test";
import { buildTryoutMutationPayload, emptyTryoutDraft } from "../../lib/tryout-admin";

type Editor = "programs" | "tryouts" | "shop";

// These tests use real local authentication/read access and intercept only the
// editor mutation/receipt boundary. They never publish changes to fixtures.
async function reopen(page: Page, editor: Editor) {
  if (editor === "programs") await page.frameLocator(".program-canvas-frame").getByRole("button", { name: "Edit Program hero", exact: true }).click();
  if (editor === "tryouts") await page.frameLocator("iframe").getByRole("button", { name: "Edit page introduction", exact: true }).click();
  if (editor === "shop") await page.getByRole("button", { name: "Edit kit text", exact: true }).click();
}

test("Programs directory locks visibility and retries its original request after both transports fail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const baseline = await (await page.request.get("/api/admin/programs-directory")).json();
  const submitted: Array<{ operationId: string; programs: Array<{ id: string; status: string; sortOrder: number }> }> = [];
  await page.route("**/api/admin/programs-directory**", async (route) => {
    if (route.request().method() !== "POST") return route.abort();
    const request = route.request().postDataJSON(); submitted.push(request);
    expect(route.request().headers()["x-editor-recovery"]).toBe(submitted.length > 1 ? "1" : undefined);
    if (submitted.length === 1) return route.abort();
    return route.fulfill({ json: { programs: baseline.programs.map((row: { id: string }) => {
      const desired = request.programs.find((item: { id: string }) => item.id === row.id);
      return { ...row, status: desired.status, sort_order: desired.sortOrder, updated_at: "2026-10-05T22:00:00+00:00" };
    }) } });
  });
  await page.goto("/admin/programs");
  await page.locator(".program-editor-navigation-desktop").getByRole("button", { name: /Manage programs/ }).click();
  const visibility = page.getByRole("button", { name: /^(Hide from|Show on) website$/ }).first();
  await visibility.click();
  await page.getByRole("button", { name: "Save page", exact: true }).filter({ visible: true }).first().click();
  await expect(visibility).toBeDisabled();
  await page.getByRole("button", { name: "Confirm save", exact: true }).filter({ visible: true }).first().click();
  await expect(visibility).toBeEnabled();
  expect(submitted).toHaveLength(2); expect(submitted[1]).toEqual(submitted[0]);
});

test("Programs directory keeps visibility choices and includes concurrently added programs after conflict review", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const baseline = await (await page.request.get("/api/admin/programs-directory")).json();
  const addedId = crypto.randomUUID();
  const latest = { programs: [...baseline.programs.map((row: object) => ({ ...row, updated_at: "2026-10-05T22:00:00+00:00" })), { ...baseline.programs[0], id: addedId, slug: "added-elsewhere", display_title: "Added elsewhere", sort_order: baseline.programs.length, updated_at: "2026-10-05T22:00:00+00:00" }] };
  const submitted: Array<{ expected: Array<{ id: string; updatedAt: string }>; programs: Array<{ id: string; status: string; sortOrder: number }> }> = [];
  await page.route("**/api/admin/programs-directory**", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: latest });
    const request = route.request().postDataJSON(); submitted.push(request);
    if (submitted.length === 1) return route.fulfill({ status: 409, json: { error: { code: "CONTENT_CHANGED", message: "Changed elsewhere" } } });
    return route.fulfill({ json: { programs: latest.programs.map((row: { id: string }) => {
      const desired = request.programs.find((item: { id: string }) => item.id === row.id);
      return { ...row, status: desired.status, sort_order: desired.sortOrder };
    }) } });
  });
  await page.goto("/admin/programs");
  await page.locator(".program-editor-navigation-desktop").getByRole("button", { name: /Manage programs/ }).click();
  await page.getByRole("button", { name: /^(Hide from|Show on) website$/ }).first().click();
  await page.getByRole("button", { name: "Save page", exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole("region", { name: "Review latest Programs directory" })).toContainText("Added elsewhere");
  await page.getByRole("button", { name: "Keep my draft", exact: true }).click();
  await page.getByRole("button", { name: "Save page", exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText("Programs directory saved", { exact: true })).toBeVisible();
  expect(submitted).toHaveLength(2);
  expect(submitted[1].expected.some((row) => row.id === addedId)).toBe(true);
  expect(submitted[1].programs.find((row) => row.id === submitted[0].programs[0].id)?.status).toBe(submitted[0].programs[0].status);
  expect(submitted[1].programs.map((row) => row.sortOrder)).toEqual(submitted[1].programs.map((_, index) => index));
});

async function prepare(page: Page, editor: Editor) {
  if (editor === "programs") {
    const directory = await (await page.request.get("/api/admin/programs-directory")).json();
    const program = directory.programs.find((row: { status: string }) => row.status === "active");
    expect(program).toBeTruthy();
    const baseline = await (await page.request.get(`/api/admin/programs-page?programId=${program.id}`)).json();
    await page.goto("/admin/programs");
    await page.frameLocator(".program-canvas-frame").locator(`a[href="/programs/${program.slug}"]`).first().click();
    await page.frameLocator(".program-canvas-frame").getByRole("button", { name: "Edit Program hero", exact: true }).click();
    return { url: "/api/admin/programs-page", baseline, field: page.getByLabel("Display title", { exact: true }), save: "Save program", region: "Review latest program" };
  }
  if (editor === "tryouts") {
    const baseline = await (await page.request.get("/api/admin/tryouts-page")).json();
    await page.goto("/admin/tryouts");
    await page.frameLocator("iframe").getByRole("button", { name: "Edit page introduction", exact: true }).click();
    return { url: "/api/admin/tryouts-page", baseline, field: page.getByRole("textbox", { name: "Intro shown when tryouts are published", exact: true }), save: "Save page", region: "Review changes from another editor" };
  }
  const baseline = await (await page.request.get("/api/admin/shop?surface=shop")).json();
  // Also exercise a newly authored kit when the synthetic tenant has none.
  if (!baseline.sections.length) baseline.sections = [{ id: crypto.randomUUID(), kit_variant: "home", eyebrow: "Club kit", title: "Home kit", description: "Official club kit", bullet_points: ["Adult and youth"], store_note: "Club store", cta_label: "Order", cta_link: "https://example.test/store" }];
  if (!baseline.photos.length) baseline.photos = [{ rowId: crypto.randomUUID(), assetId: null, kit_variant: "home", order: 0, url: "/favicon.ico" }];
  await page.route("**/api/admin/shop?surface=shop", (route) => route.fulfill({ json: baseline }));
  await page.goto("/admin/shop");
  await page.getByRole("button", { name: "Edit kit text", exact: true }).click();
  return { url: "/api/admin/shop", baseline, field: page.getByLabel("Kit title", { exact: true }), save: "Save page", region: "Review latest Shop page" };
}

function committed(editor: Editor, baseline: Awaited<ReturnType<typeof prepare>>["baseline"], request: Record<string, unknown>) {
  if (editor === "programs") return { ...baseline, program: { ...baseline.program, ...request.program as object, updated_at: "2026-10-05T20:00:00+00:00" } };
  if (editor === "tryouts") return { ...baseline, page: { ...baseline.page, ...request.page as object }, revision: String(BigInt(baseline.revision) + BigInt(1)) };
  const variants = request.variants as { home?: { section: object } };
  return { ...baseline, revision: String(BigInt(baseline.revision) + BigInt(1)), sections: baseline.sections.map((row: { kit_variant: string }) => row.kit_variant === "home" ? { ...row, ...variants.home?.section } : row) };
}

for (const editor of ["programs", "tryouts", "shop"] as const) {
  for (const failure of ["committed-500", "committed-network-loss", "unavailable-receipt", "not-committed"] as const) {
    test(`${editor} recovers ${failure} with the exact submitted request`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const flow = await prepare(page, editor);
      const submitted: Record<string, unknown>[] = [];
      const checks: string[] = [];
      let receipt = flow.baseline;
      await page.route(`**${flow.url}**`, async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() === "POST") {
          const request = route.request().postDataJSON(); submitted.push(request);
          expect(route.request().headers()["x-editor-recovery"]).toBe(submitted.length > 1 ? "1" : undefined);
          receipt = committed(editor, flow.baseline, request);
          if (submitted.length > 1) return route.fulfill({ json: receipt });
          if (failure === "committed-network-loss" || failure === "unavailable-receipt") return route.abort();
          return route.fulfill({ status: 500, json: { error: { code: "DATABASE_OPERATION_FAILED", message: "Could not confirm save." } } });
        }
        if (url.searchParams.has("operationId")) {
          checks.push(url.searchParams.get("operationId")!);
          if (failure === "unavailable-receipt") return route.abort();
          return route.fulfill({ json: { ...flow.baseline, operation: failure.startsWith("committed") ? { status: "committed", receipt } : { status: "not-committed" } } });
        }
        return route.fulfill({ json: flow.baseline });
      });
      const marker = `Recovery ${editor}`;
      await flow.field.fill(marker);
      await page.getByRole("button", { name: flow.save, exact: true }).filter({ visible: true }).first().click();
      if (!failure.startsWith("committed")) {
        await expect(flow.field).toBeDisabled();
        await expect(flow.field).toHaveValue(marker);
        await expect(page.getByRole("alert").first()).toContainText("exact request");
        await page.getByRole("button", { name: "Confirm save", exact: true }).filter({ visible: true }).first().click();
        expect(submitted).toHaveLength(2); expect(submitted[1]).toEqual(submitted[0]);
      }
      if (editor === "tryouts") await reopen(page, editor);
      await expect(flow.field).toBeEnabled();
      await expect(flow.field).toHaveValue(marker);
      expect(checks).toEqual([submitted[0].operationId]);
      if (failure.startsWith("committed")) expect(submitted).toHaveLength(1);
    });
  }

  test(`${editor} preserves its draft through a reviewed conflict`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const flow = await prepare(page, editor);
    const submitted: Record<string, unknown>[] = [];
    const latest = editor === "programs" ? { ...flow.baseline, program: { ...flow.baseline.program, display_title: "Saved elsewhere", updated_at: "2026-10-05T21:00:00+00:00" } } : { ...flow.baseline, revision: String(BigInt(flow.baseline.revision) + BigInt(1)) };
    if (editor === "tryouts") latest.events = [...latest.events, { ...buildTryoutMutationPayload({ ...emptyTryoutDraft(latest.events.length), headline: "Added elsewhere" }), id: crypto.randomUUID(), updated_at: "2026-10-05T21:00:00+00:00" }];
    await page.route(`**${flow.url}**`, async (route) => {
      if (route.request().method() !== "POST") return route.fulfill({ json: latest });
      const request = route.request().postDataJSON(); submitted.push(request);
      return submitted.length === 1 ? route.fulfill({ status: 409, json: { error: { code: editor === "tryouts" ? "TRYOUTS_CHANGED" : "CONTENT_CHANGED", message: "Changed elsewhere" } } }) : route.fulfill({ json: committed(editor, latest, request) });
    });
    await flow.field.fill("Keep this draft");
    await page.getByRole("button", { name: flow.save, exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByRole("region", { name: flow.region })).toBeVisible();
    await reopen(page, editor);
    await expect(flow.field).toHaveValue("Keep this draft");
    await page.getByRole("button", { name: "Keep my draft", exact: true }).click();
    await page.getByRole("button", { name: flow.save, exact: true }).filter({ visible: true }).first().click();
    if (editor === "tryouts") await reopen(page, editor);
    await expect(flow.field).toHaveValue("Keep this draft");
    await expect(flow.field).toBeEnabled(); expect(submitted).toHaveLength(2);
    expect(submitted[1].operationId).not.toBe(submitted[0].operationId);
    if (editor === "programs") expect((submitted[1].expected as { programUpdatedAt: string }).programUpdatedAt).toBe(latest.program.updated_at);
    else expect(submitted[1].expectedRevision).toBe(latest.revision);
    if (editor === "tryouts") expect((submitted[1].events as Array<{ headline: string }>).some((event) => event.headline === "Added elsewhere")).toBe(true);
  });

  test(`${editor} prevents changing a draft while its POST is in flight`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const flow = await prepare(page, editor);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**${flow.url}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await barrier; return route.fulfill({ json: committed(editor, flow.baseline, route.request().postDataJSON()) });
    });
    await flow.field.fill("Submitted draft");
    await page.getByRole("button", { name: flow.save, exact: true }).filter({ visible: true }).first().click();
    try { await expect(flow.field).toBeDisabled(); await expect(flow.field).toHaveValue("Submitted draft"); }
    finally { release(); }
    if (editor === "tryouts") await reopen(page, editor);
    await expect(flow.field).toBeEnabled(); await expect(flow.field).toHaveValue("Submitted draft");
  });
}
