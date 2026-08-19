import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";

type ParseResult =
  | { outcome: "accepted"; submission: Record<string, string> }
  | { outcome: "dropped" }
  | { outcome: "invalid"; message: string };
type Parse = (value: unknown) => ParseResult;

const validSubmission = {
  player_first_name: "  Ada ",
  player_last_name: "Rivera",
  player_dob: "2014-03-09",
  parent_guardian_name: "Marta Rivera",
  parent_guardian_email: " marta@example.test ",
  parent_guardian_phone: "+1-503-555-0142",
  interest_area: "Goalkeeping",
  notes: "Available weekends only.",
};

describe("registration interest inbound validation (lib/registration-interest-inbound)", () => {
  it("accepts a valid submission and trims every field", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/registration-interest-inbound",
      "parseRegistrationInterestInbound",
    );
    const result = parse(validSubmission);
    expect(result).toEqual({
      outcome: "accepted",
      submission: {
        player_first_name: "Ada",
        player_last_name: "Rivera",
        player_dob: "2014-03-09",
        parent_guardian_name: "Marta Rivera",
        parent_guardian_email: "marta@example.test",
        parent_guardian_phone: "+1-503-555-0142",
        interest_area: "Goalkeeping",
        notes: "Available weekends only.",
      },
    });
  });

  it("accepts a submission with no optional fields", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/registration-interest-inbound",
      "parseRegistrationInterestInbound",
    );
    const { interest_area: _interestArea, notes: _notes, ...required } =
      validSubmission;
    expect(parse(required)).toEqual({
      outcome: "accepted",
      submission: {
        player_first_name: "Ada",
        player_last_name: "Rivera",
        player_dob: "2014-03-09",
        parent_guardian_name: "Marta Rivera",
        parent_guardian_email: "marta@example.test",
        parent_guardian_phone: "+1-503-555-0142",
      },
    });
    expect(
      parse({ ...required, interest_area: "   ", notes: "  " }),
    ).toEqual({
      outcome: "accepted",
      submission: {
        player_first_name: "Ada",
        player_last_name: "Rivera",
        player_dob: "2014-03-09",
        parent_guardian_name: "Marta Rivera",
        parent_guardian_email: "marta@example.test",
        parent_guardian_phone: "+1-503-555-0142",
      },
    });
  });

  it("rejects an invalid guardian email format", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/registration-interest-inbound",
      "parseRegistrationInterestInbound",
    );
    expect(
      parse({ ...validSubmission, parent_guardian_email: "not-an-email" })
        .outcome,
    ).toBe("invalid");
  });

  it("rejects missing and overlong required fields", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/registration-interest-inbound",
      "parseRegistrationInterestInbound",
    );
    expect(
      parse({ ...validSubmission, player_first_name: undefined }).outcome,
    ).toBe("invalid");
    expect(
      parse({ ...validSubmission, player_first_name: "" }).outcome,
    ).toBe("invalid");
    expect(
      parse({ ...validSubmission, player_first_name: "x".repeat(81) })
        .outcome,
    ).toBe("invalid");
    expect(
      parse({ ...validSubmission, parent_guardian_name: "x".repeat(161) })
        .outcome,
    ).toBe("invalid");
    expect(parse(null).outcome).toBe("invalid");
    expect(parse([validSubmission]).outcome).toBe("invalid");
  });

  it("rejects an implausible date of birth", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/registration-interest-inbound",
      "parseRegistrationInterestInbound",
    );
    expect(
      parse({ ...validSubmission, player_dob: "2999-01-01" }).outcome,
      "a future date of birth is never a real player",
    ).toBe("invalid");
    expect(
      parse({ ...validSubmission, player_dob: "1899-12-31" }).outcome,
      "a date of birth before the plausibility floor is rejected",
    ).toBe("invalid");
    expect(
      parse({ ...validSubmission, player_dob: "not-a-date" }).outcome,
    ).toBe("invalid");
  });

  it("silently drops a honeypot-filled submission, never erroring", async () => {
    const parse = await loadContract<Parse>(
      "@/lib/registration-interest-inbound",
      "parseRegistrationInterestInbound",
    );
    const honeypotField = await loadContract<string>(
      "@/lib/registration-interest-inbound",
      "INTEREST_HONEYPOT_FIELD",
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
    expect(
      parse({ ...validSubmission, [honeypotField]: "" }).outcome,
    ).toBe("accepted");
  });
});
