/** Local browser-test login. Run with .env.test exported; never prints credentials. */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { chmod, mkdir } from "node:fs/promises";

if (new URL(process.env.SUPABASE_TEST_URL).hostname !== "127.0.0.1") {
  throw new Error("This login helper requires local Supabase.");
}
const client = createClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket },
});
const { data, error } = await client.auth.admin.getUserById("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
if (error) throw error;
const directory = "/private/tmp/onzio-homepage-tests";
await mkdir(directory, { recursive: true, mode: 0o700 });
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://alpha.localhost:3110/admin/login");
  await page.getByLabel("Email", { exact: true }).fill(data.user.email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await page.getByRole("heading", { name: "Enter your code" }).waitFor();
  const messages = await (await fetch("http://127.0.0.1:54324/api/v1/messages")).json();
  const message = messages.messages.find(item => item.To.some(recipient => recipient.Address === data.user.email));
  const code = message?.Subject.match(/^(\d{6})\b/)?.[1];
  if (!code) throw new Error("Local sign-in code not found.");
  await page.getByLabel("Sign-in code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("http://alpha.localhost:3110/admin");
  const path = `${directory}/local-auth.json`;
  await context.storageState({ path });
  await chmod(path, 0o600);
} finally { await browser.close(); }
