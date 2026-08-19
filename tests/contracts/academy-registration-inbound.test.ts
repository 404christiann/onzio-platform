import { describe, expect, it } from "vitest";
import { parseAcademyRegistrationInbound } from "@/lib/academy-registration-inbound";

const validSubmission = {
  playerFirstName: "  Ada ",
  playerLastName: "Rivera",
  playerDob: "2014-03-09",
  parentGuardianName: " Marta Rivera ",
  parentGuardianEmail: " marta@example.test ",
  parentGuardianPhone: " +1-503-555-0142 ",
  notes: "  Prefers weekend sessions.  ",
  waiverAccepted: true,
};

describe("academy registration inbound validation (lib/academy-registration-inbound)", () => {
  it("accepts a valid submission and trims every string field", () => {
    const result = parseAcademyRegistrationInbound(validSubmission);
    expect(result).toEqual({
      outcome: "accepted",
      submission: {
        playerFirstName: "Ada",
        playerLastName: "Rivera",
        playerDob: "2014-03-09",
        parentGuardianName: "Marta Rivera",
        parentGuardianEmail: "marta@example.test",
        parentGuardianPhone: "+1-503-555-0142",
        notes: "Prefers weekend sessions.",
        waiverAccepted: true,
      },
    });
  });

  it("accepts an omitted or blank optional notes field", () => {
    const { notes: _notes, ...withoutNotes } = validSubmission;
    expect(parseAcademyRegistrationInbound(withoutNotes)).toEqual({
      outcome: "accepted",
      submission: {
        playerFirstName: "Ada",
        playerLastName: "Rivera",
        playerDob: "2014-03-09",
        parentGuardianName: "Marta Rivera",
        parentGuardianEmail: "marta@example.test",
        parentGuardianPhone: "+1-503-555-0142",
        waiverAccepted: true,
      },
    });
    expect(
      parseAcademyRegistrationInbound({ ...validSubmission, notes: "   " })
        .outcome,
    ).toBe("accepted");
  });

  it("rejects a submission whose waiver checkbox was not accepted", () => {
    expect(
      parseAcademyRegistrationInbound({
        ...validSubmission,
        waiverAccepted: false,
      }).outcome,
    ).toBe("invalid");
    const { waiverAccepted: _waiverAccepted, ...withoutWaiver } =
      validSubmission;
    expect(parseAcademyRegistrationInbound(withoutWaiver).outcome).toBe(
      "invalid",
    );
  });

  it("rejects a future date of birth", () => {
    const result = parseAcademyRegistrationInbound({
      ...validSubmission,
      playerDob: "2999-01-01",
    });
    expect(result.outcome).toBe("invalid");
  });

  it("rejects a malformed date of birth", () => {
    expect(
      parseAcademyRegistrationInbound({
        ...validSubmission,
        playerDob: "03/09/2014",
      }).outcome,
    ).toBe("invalid");
    expect(
      parseAcademyRegistrationInbound({
        ...validSubmission,
        playerDob: "not-a-date",
      }).outcome,
    ).toBe("invalid");
  });

  it("rejects an invalid guardian email", () => {
    expect(
      parseAcademyRegistrationInbound({
        ...validSubmission,
        parentGuardianEmail: "not-an-email",
      }).outcome,
    ).toBe("invalid");
  });

  it("rejects missing, empty, and overlong required fields", () => {
    expect(
      parseAcademyRegistrationInbound({
        ...validSubmission,
        playerFirstName: undefined,
      }).outcome,
    ).toBe("invalid");
    expect(
      parseAcademyRegistrationInbound({
        ...validSubmission,
        parentGuardianName: "   ",
      }).outcome,
    ).toBe("invalid");
    expect(
      parseAcademyRegistrationInbound({
        ...validSubmission,
        playerFirstName: "x".repeat(81),
      }).outcome,
    ).toBe("invalid");
    expect(
      parseAcademyRegistrationInbound({
        ...validSubmission,
        notes: "x".repeat(2001),
      }).outcome,
    ).toBe("invalid");
    expect(parseAcademyRegistrationInbound(null).outcome).toBe("invalid");
    expect(parseAcademyRegistrationInbound([validSubmission]).outcome).toBe(
      "invalid",
    );
  });
});
