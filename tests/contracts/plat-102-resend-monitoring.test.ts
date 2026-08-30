import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { expectContractError, loadContract } from "../helpers/contract";

type Verify = (input: Record<string, unknown>) => Record<string, unknown>;
type Sanitize = (input: Record<string, unknown>, deliveryId: string) => Record<string, unknown>;

const secret = `whsec_${Buffer.from("contract-secret-key").toString("base64")}`;
const id = "msg_contract_123";
const timestamp = "1785800000";
const payload = JSON.stringify({
  type: "email.bounced",
  created_at: "2026-08-03T20:53:20.000Z",
  data: {
    email_id: "email_provider_123",
    to: ["private-recipient@example.com"],
    subject: "Private subject must not persist",
  },
});
const signature = createHmac("sha256", Buffer.from("contract-secret-key"))
  .update(`${id}.${timestamp}.${payload}`)
  .digest("base64");

describe("PLAT-102 Resend delivery monitoring", () => {
  it("verifies the raw signed payload", async () => {
    const verify = await loadContract<Verify>(
      "@/lib/resend-webhook",
      "verifyResendWebhook",
    );
    expect(
      verify({
        payload,
        webhookId: id,
        webhookTimestamp: timestamp,
        webhookSignature: `v1,${signature}`,
        secret,
        now: new Date(Number(timestamp) * 1000),
      }),
    ).toMatchObject({ type: "email.bounced" });
  });

  it("rejects invalid signatures", async () => {
    const verify = await loadContract<Verify>(
      "@/lib/resend-webhook",
      "verifyResendWebhook",
    );
    await expectContractError(
      () =>
        verify({
          payload,
          webhookId: id,
          webhookTimestamp: timestamp,
          webhookSignature: "v1,invalid",
          secret,
          now: new Date(Number(timestamp) * 1000),
        }),
      "INVALID_RESEND_SIGNATURE",
    );
  });

  it("persists only the provider id, event type, time, and payload digest", async () => {
    const sanitize = await loadContract<Sanitize>(
      "@/lib/resend-webhook",
      "sanitizeResendEvent",
    );
    const result = sanitize(JSON.parse(payload), id);
    expect(result).toEqual({
      id,
      eventType: "email.bounced",
      occurredAt: "2026-08-03T20:53:20.000Z",
      providerEmailId: "email_provider_123",
      payloadDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(result)).not.toContain("private-recipient");
    expect(JSON.stringify(result)).not.toContain("Private subject");
  });
});
