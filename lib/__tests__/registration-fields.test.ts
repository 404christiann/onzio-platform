import { describe, expect, it } from "vitest";
import {
  buildCoreRegistrationFields,
  validateRegistrationAnswers,
  type RegistrationFieldDefinition,
} from "@/lib/registration-fields";

const definitions: RegistrationFieldDefinition[] = [
  { key: "full_name", label: "Full name", type: "name", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone", type: "phone", required: true },
  { key: "birth_date", label: "Birth date", type: "date", required: true },
  { key: "jersey_number", label: "Jersey number", type: "number", required: true },
  { key: "notes", label: "Notes", type: "short_text", required: false },
  { key: "division", label: "Division", type: "dropdown", required: true, options: ["U10", "U12"] },
  { key: "waiver", label: "Waiver", type: "checkbox", required: true },
  { key: "newsletter", label: "Newsletter", type: "checkbox", required: false },
];

function answers(overrides: Record<string, unknown> = {}) {
  return {
    full_name: "  Ada Lovelace  ",
    email: "  ada@example.com  ",
    phone: " +1 (503) 555-0100 ",
    birth_date: " 2010-02-28 ",
    jersey_number: 10,
    notes: "  Left footed  ",
    division: " U12 ",
    waiver: true,
    newsletter: false,
    ...overrides,
  };
}

describe("registration field validation", () => {
  it("validates every field type and returns trimmed answers", () => {
    expect(validateRegistrationAnswers(definitions, answers())).toEqual({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+1 (503) 555-0100",
      birth_date: "2010-02-28",
      jersey_number: 10,
      notes: "Left footed",
      division: "U12",
      waiver: true,
      newsletter: false,
    });
  });

  it("permits omitted optional values and preserves valid false checkboxes", () => {
    const result = validateRegistrationAnswers(definitions, answers({ notes: undefined, newsletter: false }));
    expect(result).not.toHaveProperty("notes");
    expect(result.newsletter).toBe(false);
  });

  it.each([
    ["email", "not-an-email"],
    ["phone", "letters only"],
    ["birth_date", "2024-02-30"],
    ["jersey_number", Number.NaN],
    ["division", "U14"],
    ["waiver", false],
  ])("rejects an invalid %s answer", (key, value) => {
    expect(() => validateRegistrationAnswers(definitions, answers({ [key]: value }))).toThrow(
      expect.objectContaining({ code: key === "waiver" ? "REGISTRATION_FIELD_REQUIRED" : "INVALID_REGISTRATION_FIELD_VALUE" }),
    );
  });

  it("rejects missing required and unknown answers", () => {
    expect(() => validateRegistrationAnswers(definitions, answers({ full_name: "   " }))).toThrow(
      expect.objectContaining({ code: "REGISTRATION_FIELD_REQUIRED" }),
    );
    expect(() => validateRegistrationAnswers(definitions, answers({ attacker_value: "nope" }))).toThrow(
      expect.objectContaining({ code: "UNKNOWN_REGISTRATION_FIELD" }),
    );
    expect(() => validateRegistrationAnswers(definitions, ["not", "an", "object"])).toThrow(
      expect.objectContaining({ code: "INVALID_REGISTRATION_ANSWERS" }),
    );
  });

  it("rejects malformed definitions, duplicate keys, and invalid dropdown options", () => {
    expect(() => validateRegistrationAnswers([], {})).toThrow(
      expect.objectContaining({ code: "INVALID_REGISTRATION_FIELD_DEFINITION" }),
    );
    expect(() => validateRegistrationAnswers([...definitions, definitions[0]], answers())).toThrow(
      expect.objectContaining({ code: "DUPLICATE_REGISTRATION_FIELD_KEY" }),
    );
    expect(() => validateRegistrationAnswers([{ key: "division", label: "Division", type: "dropdown", required: true, options: ["U10", "u10"] }], { division: "U10" })).toThrow(
      expect.objectContaining({ code: "INVALID_REGISTRATION_FIELD_DEFINITION" }),
    );
    expect(() => validateRegistrationAnswers([{ key: "division", label: "Division", type: "dropdown", required: true }], { division: "U10" })).toThrow(
      expect.objectContaining({ code: "INVALID_REGISTRATION_FIELD_DEFINITION" }),
    );
  });

  it("builds the correct required shared core fields for minors and adults", () => {
    expect(buildCoreRegistrationFields(true).map((field) => field.key)).toEqual([
      "player_name", "guardian_name", "guardian_email", "guardian_phone", "emergency_contact_name", "emergency_contact_phone",
    ]);
    expect(buildCoreRegistrationFields(false).map((field) => field.key)).toEqual([
      "registrant_name", "registrant_email", "registrant_phone", "emergency_contact_name", "emergency_contact_phone",
    ]);
    expect(buildCoreRegistrationFields(true).every((field) => field.required && field.isCore)).toBe(true);
  });
});
