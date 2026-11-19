#!/usr/bin/env node
// Sign the local owner (owner-aal2@alpha.local, aaaaaaaa-...-a1) into the Rose City classic admin
// through the real email-code flow (Inbucket/Mailpit on 127.0.0.1:54324) and save a storage state.
// The Supabase session cookies are copied to diverse-city.localhost too, so one code covers both
// clubs (local auth allows one code per address per minute). Never prints the code or cookies.
//
//   node sign-in.mjs <base-url, e.g. http://rose-city.localhost:3110> <out.json>
import { chromium } from "@playwright/test";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { nextSignInWait } from "./sign-in-retry.mjs";

const [baseURL, out] = process.argv.slice(2);
if (!baseURL || !out) throw new Error("usage: sign-in.mjs <base-url> <out.json>");
const host = new URL(baseURL).hostname;
if (!host.endsWith(".localhost")) throw new Error("sign-in: loopback *.localhost hosts only");
const email = "owner-aal2@alpha.local";
const mailpit = "http://127.0.0.1:54324";

process.umask(0o077); // the storage state holds session cookies: owner-only from the first write
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // One code per address per ~60 s: if another run just signed this address in, the code screen or the mail does not come.
  // Wait out the window and ask again (bounded, see sign-in-retry.mjs) instead of failing the whole run.
  let code;
  for (let attempt = 1; !code; attempt++) {
    const askedAt = Date.now();
    try {
      await page.goto(`${baseURL}/admin/login`);
      await page.getByLabel("Email address", { exact: true }).fill(email);
      await page.getByRole("button", { name: "Send sign-in code" }).click();
      await page.getByRole("heading", { name: "Enter your code" }).waitFor({ timeout: 30_000 });
      for (let poll = 0; poll < 30 && !code; poll++) {
        const { messages = [] } = await (await fetch(`${mailpit}/api/v1/messages`)).json();
        const fresh = messages
          .filter((m) => m.To?.some((to) => to.Address === email) && Date.parse(m.Created) >= askedAt - 2_000)
          .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created));
        code = fresh[0]?.Subject?.match(/^(\d{6,10})\b/)?.[1];
        if (!code) await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      if (!code) throw new Error("no fresh code in Inbucket");
    } catch (error) {
      const plan = nextSignInWait({ attempt, elapsedMs: Date.now() - askedAt });
      if (!plan.retry) throw new Error(`sign-in: no code after ${attempt} attempts (${String(error).split("\n")[0]}; local auth sends one code per address per ~60 s)`);
      console.error(`sign-in: attempt ${attempt} got no code (${String(error).split("\n")[0]}); waiting ${Math.round(plan.waitMs / 1000)} s for the one-code-per-minute window`);
      await new Promise((resolve) => setTimeout(resolve, plan.waitMs));
    }
  }
  await page.getByLabel("Sign-in code", { exact: true }).fill(code);
  await page.waitForURL((url) => url.pathname === "/admin", { timeout: 60_000 });
  await context.storageState({ path: out });
} finally {
  await browser.close();
}

const state = JSON.parse(await readFile(out, "utf8"));
const extra = state.cookies.filter((c) => c.domain === host).map((c) => ({ ...c, domain: "diverse-city.localhost" }));
state.cookies.push(...extra);
await writeFile(out, JSON.stringify(state));
await chmod(out, 0o600);
console.log(JSON.stringify({ signedIn: true, host, cookies: state.cookies.length, clonedTo: "diverse-city.localhost" }));
