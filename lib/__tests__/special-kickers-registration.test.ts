import { describe, expect, it } from "vitest";
import {
  SPECIAL_KICKERS_CORE_FIELD_LABELS,
  SPECIAL_KICKERS_REGISTRATION_DRAFT,
  SPECIAL_KICKERS_WAIVER,
} from "@/scripts/fixtures/special-kickers-registration";

describe("Special Kickers registration draft", () => {
  it("stays a review-only both-mode form with the exact fee", () => {
    expect(SPECIAL_KICKERS_REGISTRATION_DRAFT).toMatchObject({
      title: "Special Kickers Registration & Waiver",
      participant_mode: "both",
      status: "draft",
      price: {
        amount_cents: 13000,
        active: true,
      },
    });
  });

  it("covers the Tally participant, support, medical, soccer, guardian, emergency, pickup, media, and consent inputs", () => {
    const fields = new Map(
      SPECIAL_KICKERS_REGISTRATION_DRAFT.customFields.map((field) => [
        field.field_key,
        field,
      ]),
    );
    expect([...fields.keys()]).toEqual(
      expect.arrayContaining([
        "participant_last_name",
        "participant_date_of_birth",
        "participant_age",
        "participant_address",
        "participant_city",
        "participant_state",
        "participant_zip_code",
        "participant_gender",
        "participant_grade",
        "diagnosis_disability",
        "preferred_communication_method",
        "mobility",
        "sensory_behavioral_supports",
        "has_allergies",
        "allergy_details",
        "medical_conditions",
        "medications",
        "has_emergency_medication",
        "emergency_medication_details",
        "insurance_provider",
        "insurance_policy_number",
        "physician",
        "physician_phone",
        "previous_soccer_participation",
        "soccer_experience",
        "jersey_size",
        "guardian_1_address",
        "guardian_1_last_name",
        "guardian_1_relationship",
        "guardian_2_first_name",
        "guardian_2_last_name",
        "guardian_2_phone",
        "guardian_2_email",
        "guardian_2_address",
        "guardian_2_relationship",
        "emergency_contact_last_name",
        "emergency_contact_alternate_phone",
        "emergency_contact_relationship",
        "authorized_pickup_1_name",
        "authorized_pickup_1_phone",
        "authorized_pickup_2_name",
        "authorized_pickup_2_phone",
        "photo_video_authorization",
        "consent_printed_name",
        "consent_date",
        "consent_signature",
      ]),
    );
    expect(fields.get("guardian_1_relationship")?.participant_scope).toBe(
      "minor",
    );
    expect(fields.get("guardian_1_last_name")?.required).toBe(true);
    expect(fields.get("authorized_pickup_1_name")?.participant_scope).toBe(
      "minor",
    );
    expect(fields.get("consent_signature")).toMatchObject({
      field_type: "signature",
      required: true,
      participant_scope: "all",
    });
    expect(fields.get("jersey_size")?.options).toEqual([
      "Youth XS",
      "Youth S",
      "Youth M",
      "Youth L",
      "Youth XL",
      "Adult S",
      "Adult M",
      "Adult L",
      "Adult XL",
      "Adult XXL",
    ]);
    expect(SPECIAL_KICKERS_CORE_FIELD_LABELS).toMatchObject({
      player_name: "Child First Name",
      guardian_name: "Parent/Guardian #1 First Name",
      emergency_contact_name: "Emergency Contact First Name",
    });
  });

  it("adapts the located waiver for either an adult or a guardian without inventing a different program", () => {
    expect(SPECIAL_KICKERS_WAIVER).toContain("Assumption of Risk");
    expect(SPECIAL_KICKERS_WAIVER).toContain("Health Certification");
    expect(SPECIAL_KICKERS_WAIVER).toContain("Emergency Medical Authorization");
    expect(SPECIAL_KICKERS_WAIVER).toContain(
      "Participant and Guardian Responsibilities",
    );
    expect(SPECIAL_KICKERS_WAIVER).toContain("Release of Liability");
    expect(SPECIAL_KICKERS_WAIVER).toContain("Diverse City FC");
    expect(SPECIAL_KICKERS_WAIVER).toContain(
      "legal review before the form is opened",
    );
  });
});
