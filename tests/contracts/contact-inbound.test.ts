import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";

type ParseResult =
  | { outcome: "accepted"; submission: Record<string, string> }
  | { outcome: "dropped" }
  | { outcome: "invalid"; message: string };
type Parse = (value: unknown) => ParseResult;
type Build = (input: {
  clubName: string;
  from: string;
  to: string;
  submission: Record<string, string>;
}) => Record<string, string>;

const validSubmission = {
  firstName: "  Jordan ",
  lastName: "Rivera",
  email: " jordan.rivera@example.com ",
  phone: " +1 (937) 555-0123 ",
  message: "  Interested in training sessions for my daughter.  ",
};

describe("contact inbound validation (lib/contact-inbound)", () => {
  it("accepts a valid submission and trims every field", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/contact-inbound",
      "parseContactInbound",
    );
    const result = parse(validSubmission);
    expect(result).toEqual({
      outcome: "accepted",
      submission: {
        firstName: "Jordan",
        lastName: "Rivera",
        email: "jordan.rivera@example.com",
        phone: "+1 (937) 555-0123",
        message: "Interested in training sessions for my daughter.",
      },
    });
  });

  it("rejects an invalid email format", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/contact-inbound",
      "parseContactInbound",
    );
    const result = parse({ ...validSubmission, email: "not-an-email" });
    expect(result.outcome).toBe("invalid");
  });

  it("rejects missing, empty, and overlong fields", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/contact-inbound",
      "parseContactInbound",
    );
    expect(parse({ ...validSubmission, firstName: undefined }).outcome).toBe(
      "invalid",
    );
    expect(parse({ ...validSubmission, message: "   " }).outcome).toBe(
      "invalid",
    );
    expect(
      parse({ ...validSubmission, message: "x".repeat(5001) }).outcome,
    ).toBe("invalid");
    expect(parse(null).outcome).toBe("invalid");
    expect(parse([validSubmission]).outcome).toBe("invalid");
    expect(
      parse({ ...validSubmission, phone: "1".repeat(51) }).outcome,
    ).toBe("invalid");
  });

  it("accepts an omitted or blank optional phone number", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/contact-inbound",
      "parseContactInbound",
    );
    const { phone: _phone, ...withoutPhone } = validSubmission;

    expect(parse(withoutPhone)).toEqual({
      outcome: "accepted",
      submission: {
        firstName: "Jordan",
        lastName: "Rivera",
        email: "jordan.rivera@example.com",
        message: "Interested in training sessions for my daughter.",
      },
    });
    expect(parse({ ...validSubmission, phone: "   " })).toEqual({
      outcome: "accepted",
      submission: {
        firstName: "Jordan",
        lastName: "Rivera",
        email: "jordan.rivera@example.com",
        message: "Interested in training sessions for my daughter.",
      },
    });
  });

  it("silently drops a honeypot-filled submission, never erroring", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/contact-inbound",
      "parseContactInbound",
    );
    const honeypotField = await loadContract<string>(
      "@/lib/contact-inbound",
      "CONTACT_HONEYPOT_FIELD",
    );
    expect(
      parse({ ...validSubmission, [honeypotField]: "https://spam.example" }),
    ).toEqual({ outcome: "dropped" });
    // Dropped even when the rest of the payload is invalid: a bot must never
    // receive a validation error revealing the submission was inspected.
    expect(parse({ [honeypotField]: "filled-by-bot" })).toEqual({
      outcome: "dropped",
    });
    // An empty honeypot (as real browsers submit it) is not a trip.
    expect(parse({ ...validSubmission, [honeypotField]: "" }).outcome).toBe(
      "accepted",
    );
  });

  it("builds the outbound message with the club-name subject and submitter reply-to", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/contact-inbound",
      "parseContactInbound",
    );
    const build = await loadContract<Build>(
      "@/lib/contact-inbound",
      "buildContactOutboundMessage",
    );
    const parsed = parse(validSubmission);
    if (parsed.outcome !== "accepted") {
      throw new Error("Expected the fixture submission to be accepted.");
    }
    const message = build({
      clubName: "Manu Ledesma Academy",
      from: "inquiries@platform-sender.example",
      to: "club-inbox@example.com",
      submission: parsed.submission,
    });
    expect(message).toMatchObject({
      from: "inquiries@platform-sender.example",
      to: "club-inbox@example.com",
      replyTo: "jordan.rivera@example.com",
      subject: "New inquiry — Manu Ledesma Academy",
    });
    expect(message.text).toContain("Jordan Rivera");
    expect(message.text).toContain("Phone: +1 (937) 555-0123");
    expect(message.text).toContain(
      "Interested in training sessions for my daughter.",
    );
  });

  it("makes a missing phone explicit in the outbound plain-text message", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/contact-inbound",
      "parseContactInbound",
    );
    const build = await loadContract<Build>(
      "@/lib/contact-inbound",
      "buildContactOutboundMessage",
    );
    const { phone: _phone, ...withoutPhone } = validSubmission;
    const parsed = parse(withoutPhone);
    if (parsed.outcome !== "accepted") {
      throw new Error("Expected the fixture submission to be accepted.");
    }

    const message = build({
      clubName: "Manu Ledesma Academy",
      from: "inquiries@platform-sender.example",
      to: "club-inbox@example.com",
      submission: parsed.submission,
    });
    expect(message.text).toContain("Phone: Not provided");
  });
});
