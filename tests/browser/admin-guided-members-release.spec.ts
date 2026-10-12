import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { expect, test, type BrowserContext } from "@playwright/test";
import { createLocalClients } from "../helpers/supabase";
import { assertSafeTestEnvironment } from "../helpers/environment";

const ALPHA = "11111111-1111-4111-8111-111111111111";
const MAILPIT = "http://127.0.0.1:54324";
const ARTIFACTS = "/private/tmp/onzio-guided-members-release";
type Row = Record<string, unknown>;
type Message = { ID: string; Subject: string; Created: string; To: Array<{ Address: string }>; [key: string]: unknown };

function localSafety(baseURL: string | undefined) {
  if (!baseURL || new URL(baseURL).origin !== "http://alpha.localhost:3110") {
    throw new Error("Membership release checks require the isolated Alpha app on port 3110.");
  }
  if (!process.env.SUPABASE_TEST_URL || !process.env.SUPABASE_TEST_SERVICE_ROLE_KEY) {
    throw new Error("Export the explicit isolated local Supabase test environment.");
  }
  const { supabaseUrl } = assertSafeTestEnvironment();
  if (new URL(supabaseUrl).origin !== "http://127.0.0.1:54321") throw new Error("Refusing a non-local Auth target.");
  const dbUrl = process.env.SUPABASE_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!dbUrl || !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname) || new URL(dbUrl).port !== "54322") {
    throw new Error("Membership cleanup requires an explicit loopback test database on port 54322.");
  }
  const project = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([a-z0-9-]+)"/m)?.[1];
  if (project !== "onzio-platform-contracts") throw new Error("Refusing a different Docker project.");
  const containerEnvironment = (name: string): string[] => JSON.parse(execFileSync("docker", ["inspect", name, "--format", "{{json .Config.Env}}"], { encoding: "utf8" }));
  const auth = containerEnvironment(`supabase_auth_${project}`);
  const mailbox = containerEnvironment(`supabase_inbucket_${project}`);
  if (!auth.includes(`GOTRUE_SMTP_HOST=supabase_inbucket_${project}`) || !auth.includes("GOTRUE_SMTP_PORT=1025")) {
    throw new Error("Refusing Auth SMTP that does not point to the local Mailpit container.");
  }
  if (mailbox.some(value => /^MP_SMTP_(RELAY|FORWARD)/.test(value) && value.split("=").slice(1).join("=").trim())) {
    throw new Error("Refusing a Mailpit mailbox configured for outbound relay or forwarding.");
  }
  return new Client({ connectionString: dbUrl });
}

async function messages(): Promise<Message[]> {
  const result: Message[] = [];
  for (let start = 0; ; start += 100) {
    const response = await fetch(`${MAILPIT}/api/v1/messages?start=${start}&limit=100`);
    if (!response.ok) throw new Error("Local Mailpit listing unavailable.");
    const body = await response.json() as { messages: Message[] };
    result.push(...body.messages);
    if (body.messages.length < 100) return result.sort((a, b) => a.ID.localeCompare(b.ID));
  }
}

async function snapshot(db: Client) {
  const rows = async (table: string, order: string): Promise<Row[]> =>
    (await db.query(`select to_jsonb(row) as row from ${table} row order by ${order}`)).rows.map(entry => entry.row);
  return {
    users: await rows("auth.users", "id"),
    identities: await rows("auth.identities", "id"),
    authAudit: await rows("auth.audit_log_entries", "id"),
    members: await rows("onzio.club_members", "club_id,user_id"),
    audit: await rows("onzio.audit_events", "id"),
    mail: await messages(),
  };
}

async function blockUnrelated(context: BrowserContext, email: string, userId: () => string | undefined) {
  const unexpected: string[] = [];
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const local = ["alpha.localhost", "127.0.0.1", "localhost"].includes(url.hostname);
    let allowed = local && !url.pathname.startsWith("/api/stripe/");
    if (url.pathname === "/api/stripe/billing-admin" && request.method() === "GET") allowed = local;
    if (allowed && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      const body = request.postDataJSON() as { operation?: string; action?: string; email?: string; userId?: string };
      allowed = (url.pathname === "/api/admin/data" && body.operation === "select") ||
        (url.pathname === "/api/admin/members" && ((body.action === "add" && body.email === email) || (body.action === "remove" && body.userId === userId()))) ||
        (url.pathname === "/auth/v1/verify" && body.email === email) ||
        (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token");
    }
    if (allowed) return route.continue();
    if (local && url.pathname.startsWith("/api/stripe/")) return route.abort();
    if (!local) return route.abort();
    unexpected.push(`${request.method()} ${url.pathname}`);
    await route.abort();
  });
  return unexpected;
}

for (const width of [390, 1440]) {
  test(`${width}px real owner grants and removes one synthetic administrator; that administrator cannot manage access`, async ({ page, browser, baseURL }) => {
    test.setTimeout(120_000);
    const db = localSafety(baseURL);
    const { service } = createLocalClients();
    const marker = randomUUID();
    const email = `guided-release-${marker}@local.test`;
    const deniedEmail = `guided-denied-${marker}@local.test`;
    let createdUserId: string | undefined;
    let adminContext: BrowserContext | undefined;
    await db.connect();
    const club = await db.query("select kind,lifecycle,public_access from onzio.clubs where id=$1", [ALPHA]);
    expect(club.rows).toEqual([{ kind: "test", lifecycle: "active", public_access: "live" }]);
    const original = await snapshot(db);
    expect(original.users.some(row => row.email === email || row.email === deniedEmail)).toBe(false);
    await mkdir(ARTIFACTS, { recursive: true, mode: 0o700 });
    await writeFile(`${ARTIFACTS}/${marker}-original.json`, JSON.stringify(original), { mode: 0o600 });
    const unexpectedOwner = await blockUnrelated(page.context(), email, () => createdUserId);
    try {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/admin/members");
      await expect(page.getByText("You · owner", { exact: true })).toBeVisible();
      const input = page.getByRole("textbox", { name: "Email", exact: true });
      await input.fill(email);
      const addition = page.waitForResponse(response => response.url().endsWith("/api/admin/members") && response.request().method() === "POST");
      await page.getByRole("button", { name: "Send access code", exact: true }).click();
      const response = await addition;
      expect(response.status()).toBe(200);
      const added = await response.json() as { userId: string; email: string; role: string; codeSent: boolean };
      createdUserId = added.userId;
      expect(added).toEqual({ userId: createdUserId, email, role: "admin", codeSent: true });
      await expect(page.getByRole("status")).toHaveText("Administrator added. A sign-in code was sent to their email.");
      await expect(input).toHaveValue("");
      await expect(page.getByText(email, { exact: true })).toBeVisible();
      const membership = await db.query("select role,status,removed_at from onzio.club_members where club_id=$1 and user_id=$2", [ALPHA, createdUserId]);
      expect(membership.rows).toEqual([{ role: "admin", status: "active", removed_at: null }]);
      await page.reload();
      await expect(page.getByText(email, { exact: true })).toBeVisible();
      await expect.poll(async () => (await messages()).filter(message => message.To.some(recipient => recipient.Address.toLowerCase() === email)).length).toBe(1);
      const mail = (await messages()).find(message => message.To.some(recipient => recipient.Address.toLowerCase() === email))!;
      const code = mail.Subject.match(/^(\d{6})\b/)?.[1];
      expect(code).toBeTruthy();
      adminContext = await browser.newContext({ baseURL, viewport: { width, height: 844 } });
      const unexpectedAdmin = await blockUnrelated(adminContext, email, () => createdUserId);
      const admin = await adminContext.newPage();
      await admin.goto("/admin/login");
      await admin.getByLabel("Email", { exact: false }).fill(email);
      await admin.getByRole("button", { name: "I already have a code", exact: true }).click();
      await admin.getByLabel("Sign-in code", { exact: true }).fill(code!);
      await expect(admin).toHaveURL(/\/admin$/);
      await expect(admin.locator("main h1")).toBeVisible();
      await expect(admin.locator('a[href="/admin/members"]')).toHaveCount(0);
      await expect(admin.locator('a[href="/admin/payments"]')).toHaveCount(0);
      for (const action of [{ action: "add", email: deniedEmail }, { action: "remove", userId: createdUserId }]) {
        const denied = await adminContext.request.post("/api/admin/members", { data: action });
        expect(denied.status()).toBe(403);
        expect(await denied.json()).toEqual({ error: "OWNER_REQUIRED" });
      }
      const deniedRead = await adminContext.request.get("/api/admin/members");
      expect(deniedRead.status()).toBe(403);
      expect(await deniedRead.json()).toEqual({ error: "OWNER_REQUIRED" });
      expect((await db.query("select id from auth.users where email=$1", [deniedEmail])).rows).toEqual([]);
      expect((await db.query("select status from onzio.club_members where club_id=$1 and user_id=$2", [ALPHA, createdUserId])).rows).toEqual([{ status: "active" }]);
      const row = page.locator("section > div").filter({ has: page.getByText(email, { exact: true }) });
      await expect(row).toHaveCount(1);
      const removal = page.waitForResponse(result => result.url().endsWith("/api/admin/members") && result.request().method() === "POST");
      await row.getByRole("button", { name: "Remove", exact: true }).click();
      const removed = await removal;
      expect(removed.status()).toBe(200);
      expect(await removed.json()).toEqual({ userId: createdUserId, status: "removed" });
      await expect(page.getByRole("status")).toHaveText("Administrator access removed.");
      await expect(page.getByText(email, { exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByText(email, { exact: true })).toHaveCount(0);
      const finalMembership = await db.query("select role,status,removed_at from onzio.club_members where club_id=$1 and user_id=$2", [ALPHA, createdUserId]);
      expect(finalMembership.rows[0]).toMatchObject({ role: "admin", status: "removed" });
      expect(finalMembership.rows[0].removed_at).not.toBeNull();
      const audit = await db.query("select operation from onzio.audit_events where club_id=$1 and resource_type='club_member' and resource_id=$2 order by id", [ALPHA, createdUserId]);
      expect(audit.rows).toEqual([{ operation: "membership_added" }, { operation: "membership_removed" }]);
      await admin.reload();
      await expect(admin).toHaveURL(/\/admin\/login\?error=not_authorized$/);
      expect(unexpectedOwner).toEqual([]);
      expect(unexpectedAdmin).toEqual([]);
      await writeFile(`${ARTIFACTS}/${marker}-verified.json`, JSON.stringify({ width, granted: true, codeReceivedLocally: true, signedIn: true, adminDenied: true, removed: true, removedSessionDenied: true }), { mode: 0o600 });
    } finally {
      try {
        await adminContext?.close();
        // Find only our UUID-tagged new identity, even if the add response was lost.
        const identities = await db.query<{ id: string }>("select id from auth.users where email = any($1::text[]) order by id", [[email, deniedEmail]]);
        expect(identities.rows.length).toBeLessThanOrEqual(2);
        for (const identity of identities.rows) {
          const id = identity.id;
          expect(original.users.some(row => row.id === id)).toBe(false);
          await db.query("delete from onzio.audit_events where club_id=$1 and resource_type='club_member' and resource_id=$2", [ALPHA, id]);
          await db.query("delete from onzio.club_members where club_id=$1 and user_id=$2", [ALPHA, id]);
          const deletion = await service.auth.admin.deleteUser(id, false);
          expect(deletion.error).toBeNull();
        }
        // Actual GoTrue payloads identify login/recovery with actor_id/email;
        // administrative create/delete events identify the target in traits.
        // A new ID alone is never permission to remove an unrelated audit row.
        const originalAuthAuditIds = original.authAudit.map(row => String(row.id));
        const fixtureUserIds = identities.rows.map(row => row.id);
        const fixtureEmails = [email, deniedEmail];
        const relatedAuthAudit = (row: Row) => {
          if (!row.payload || typeof row.payload !== "object") return false;
          const payload = row.payload as Record<string, unknown>;
          const traits = payload.traits && typeof payload.traits === "object" ? payload.traits as Record<string, unknown> : {};
          return [payload.actor_id, traits.user_id].some(value => typeof value === "string" && fixtureUserIds.includes(value)) ||
            [payload.actor_username, traits.user_email].some(value => typeof value === "string" && fixtureEmails.includes(value.toLowerCase()));
        };
        const beforeAuthCleanup = (await db.query<{ row: Row }>("select to_jsonb(row) as row from auth.audit_log_entries row order by id")).rows.map(entry => entry.row);
        const fixtureAuthAuditIds = beforeAuthCleanup.filter(row => !originalAuthAuditIds.includes(String(row.id)) && relatedAuthAudit(row)).map(row => String(row.id));
        if (fixtureAuthAuditIds.length) {
          await db.query(`delete from auth.audit_log_entries where id::text = any($1::text[])
            and not (id::text = any($2::text[]))
            and (payload::jsonb->>'actor_id' = any($3::text[])
              or payload::jsonb->'traits'->>'user_id' = any($3::text[])
              or lower(payload::jsonb->>'actor_username') = any($4::text[])
              or lower(payload::jsonb->'traits'->>'user_email') = any($4::text[]))`,
          [fixtureAuthAuditIds, originalAuthAuditIds, fixtureUserIds, fixtureEmails]);
        }
        const originalMailIds = new Set(original.mail.map(message => message.ID));
        const beforeMailCleanup = await messages();
        const fixtureMailIds = beforeMailCleanup.filter(message => !originalMailIds.has(message.ID) && message.To.some(recipient => fixtureEmails.includes(recipient.Address.toLowerCase()))).map(message => message.ID);
        if (fixtureMailIds.length) {
          const deletion = await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: fixtureMailIds }) });
          expect(deletion.ok).toBe(true);
        }
        const restored = await snapshot(db);
        // Original rows must remain byte-for-byte equivalent. Unrelated Auth
        // refresh history or mail appended by another context is retained.
        expect({ ...restored,
          authAudit: restored.authAudit.filter(row => originalAuthAuditIds.includes(String(row.id))),
          mail: restored.mail.filter(message => originalMailIds.has(message.ID)),
        }).toEqual(original);
        expect(restored.authAudit.filter(relatedAuthAudit)).toEqual([]);
        expect(restored.mail.filter(message => message.To.some(recipient => fixtureEmails.includes(recipient.Address.toLowerCase())))).toEqual([]);
        const retainedAuth = beforeAuthCleanup.filter(row => !relatedAuthAudit(row));
        for (const row of retainedAuth) expect(restored.authAudit.find(current => current.id === row.id)).toEqual(row);
        const retainedMail = beforeMailCleanup.filter(message => !fixtureMailIds.includes(message.ID));
        for (const message of retainedMail) expect(restored.mail.find(current => current.ID === message.ID)).toEqual(message);
        await writeFile(`${ARTIFACTS}/${marker}-cleanup.json`, JSON.stringify({ originalUsers: true, originalIdentities: true, originalAuthAudit: true, originalMemberships: true, originalAudit: true, originalMail: true, unrelatedAuthHistoryPreserved: true, unrelatedMailPreserved: true }), { mode: 0o600 });
      } finally { await db.end(); }
    }
  });
}
