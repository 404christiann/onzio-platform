import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";
import { requireFreshClubSession } from "@/lib/auth-session";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createLocalClients } from "../helpers/supabase";

type MailpitMessage = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

async function latestMessageFor(email: string): Promise<MailpitMessage> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch("http://127.0.0.1:54324/api/v1/messages");
    const body = (await response.json()) as { messages: MailpitMessage[] };
    const match = body.messages.find((message) =>
      message.To.some((recipient) => recipient.Address.toLowerCase() === email),
    );
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Local Auth email was not captured by Mailpit");
}

describe("PLAT-101 local email-code authentication", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    const { service } = createLocalClients();
    while (userIds.length > 0) {
      await service.auth.admin.deleteUser(userIds.pop()!, false);
    }
  });

  it("sends the six-digit code first, verifies it, and creates no unknown user", async () => {
    const { supabaseUrl } = assertSafeTestEnvironment();
    const { service } = createLocalClients();
    const userId = randomUUID();
    const email = `plat101-code-${userId}@onzio.local`;
    const unknownEmail = `plat101-unknown-${randomUUID()}@onzio.local`;
    const created = await service.auth.admin.createUser({
      id: userId,
      email,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    userIds.push(userId);

    const client = createClient(
      supabaseUrl,
      process.env.SUPABASE_TEST_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: {
          transport: WebSocket as unknown as typeof globalThis.WebSocket,
        },
      },
    );
    const requested = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    expect(requested.error).toBeNull();

    const message = await latestMessageFor(email);
    expect(message.Subject).toMatch(/^\d{6} is your Onzio sign-in code$/);
    const code = message.Subject.slice(0, 6);
    const detail = (await (
      await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)
    ).json()) as { HTML: string };
    expect(detail.HTML).toContain(code);
    expect(detail.HTML).not.toContain("href=");

    const verified = await client.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    expect(verified.error).toBeNull();
    await expect(requireFreshClubSession(client)).resolves.toMatchObject({
      userId,
    });

    const unknown = await client.auth.signInWithOtp({
      email: unknownEmail,
      options: { shouldCreateUser: false },
    });
    expect(unknown.error?.message).toContain("Signups not allowed for otp");
    const identities = await service.auth.admin.listUsers({ page: 1, perPage: 1_000 });
    expect(
      identities.data.users.some(
        (user) => user.email?.toLowerCase() === unknownEmail,
      ),
    ).toBe(false);
  });
});
