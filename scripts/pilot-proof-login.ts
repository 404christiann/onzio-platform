import assert from "node:assert/strict";
import { chromium, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { USER_IDS } from "../tests/fixtures/entities";

export type PilotProofStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export async function localPilotProofLogin(base: string, signal: AbortSignal): Promise<PilotProofStorageState> {
  signal.throwIfAborted();
  const supabaseUrl = new URL(z.string().parse(process.env.SUPABASE_TEST_URL));
  assert.equal(supabaseUrl.origin, "http://127.0.0.1:54321", "Login requires synthetic loopback Supabase");
  const client = createClient(supabaseUrl.href, z.string().parse(process.env.SUPABASE_TEST_SERVICE_ROLE_KEY), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.admin.getUserById(USER_IDS.ownerAal2);
  if (error) throw new Error("Local proof owner lookup failed");
  assert(data.user.email, "Synthetic owner email is required");
  const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP pilot.localhost 127.0.0.1, EXCLUDE 127.0.0.1"] });
  const abort = () => { void browser.close(); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.routeWebSocket("**/*", socket => socket.close());
    await context.route("**/*", route => {
      const target = new URL(route.request().url());
      return [base, supabaseUrl.origin].includes(target.origin) && !target.pathname.startsWith("/_vercel/insights/")
        ? route.continue() : route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    const response = await page.goto(`${base}/admin/login`);
    assert.equal(response?.status(), 200, "Synthetic pilot login page must resolve before authentication");
    await page.getByLabel("Email address", { exact: true }).fill(data.user.email);
    const requestedAt = Date.now();
    await page.getByRole("button", { name: "Send sign-in code" }).click();
    await page.getByRole("heading", { name: "Enter your code" }).waitFor();
    const recentlySent = await page.getByRole("alert").filter({ hasText: "A sign-in code was sent recently" }).isVisible();
    let code: string | undefined;
    for (let attempt = 0; attempt < 30 && !code; attempt++) {
      const inbox = z.object({ messages: z.array(z.object({ To: z.array(z.object({ Address: z.string() })), Subject: z.string(), Created: z.string() })) }).parse(await (await fetch("http://127.0.0.1:54324/api/v1/messages")).json());
      code = inbox.messages.find(message => (recentlySent || Date.parse(message.Created) >= requestedAt - 1000) && message.To.some(recipient => recipient.Address.toLowerCase() === data.user.email?.toLowerCase()))?.Subject.match(/^(\d{6})\b/)?.[1];
      if (!code) await page.waitForTimeout(100);
    }
    assert(code, "Local sign-in code not found");
    await page.getByLabel("Sign-in code", { exact: true }).fill(code);
    await page.waitForURL(url => url.origin === base && url.pathname === "/admin");
    return await context.storageState();
  } finally { signal.removeEventListener("abort", abort); await browser.close(); }
}
