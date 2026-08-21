import type {
  RegistrationFieldType,
  RegistrationParticipantScope,
} from "@/lib/registration-fields";

export type RegistrationDraftField = {
  field_key: string;
  label: string;
  field_type: RegistrationFieldType;
  options: string[];
  required: boolean;
  is_core: false;
  participant_scope: RegistrationParticipantScope;
};

export const SPECIAL_KICKERS_CORE_FIELD_LABELS: Readonly<
  Record<string, string>
> = {
  player_name: "Child First Name",
  guardian_name: "Parent/Guardian #1 First Name",
  guardian_email: "Parent/Guardian #1 Email",
  guardian_phone: "Parent/Guardian #1 Phone Number",
  registrant_name: "Participant First Name",
  registrant_email: "Participant Email",
  registrant_phone: "Participant Phone Number",
  emergency_contact_name: "Emergency Contact First Name",
  emergency_contact_phone: "Emergency Contact Phone Number",
};

const field = (
  field_key: string,
  label: string,
  field_type: RegistrationFieldType,
  required: boolean,
  participant_scope: RegistrationParticipantScope = "all",
  options: string[] = [],
): RegistrationDraftField => ({
  field_key,
  label,
  field_type,
  options,
  required,
  is_core: false,
  participant_scope,
});

export const SPECIAL_KICKERS_WAIVER = `SPECIAL KICKERS PARTICIPATION WAIVER AND CONSENT

By accepting this waiver, I agree for myself as an adult participant or, when the participant is a minor, as the participant's parent or legal guardian.

1. Assumption of Risk. Soccer and recreational athletic activities involve inherent risks, including falls, exertion, contact with equipment or people, weather exposure, serious injury, permanent disability, and, in rare cases, death. I knowingly accept those inherent risks.

2. Health Certification. I confirm that the participant is able to take part and that I have accurately disclosed relevant medical conditions, allergies, disabilities, medications, behavioral needs, and accommodations. I will notify Diverse City FC if that information changes during the season.

3. Emergency Medical Authorization. If the participant cannot consent or I cannot be reached in an emergency, I authorize Diverse City FC personnel and emergency responders to obtain reasonably necessary care. I accept responsibility for resulting expenses.

4. Participant and Guardian Responsibilities. I will keep medical and emergency information current, arrive on time for drop-off and pick-up when applicable, report changing support needs, and help the participant follow program safety rules to the best of their ability.

5. Release of Liability. To the fullest extent Illinois law permits, I release and hold harmless Diverse City FC and its directors, officers, employees, coaches, volunteers, sponsors, facility owners, and affiliated organizations from claims arising from the inherent risks of participation, including bodily injury, illness, permanent disability, or death.

I have read and understood this waiver and voluntarily agree to it. This draft must receive Diverse City FC and legal review before the form is opened.`;

export const SPECIAL_KICKERS_REGISTRATION_DRAFT = {
  slug: "special-kickers-registration-waiver",
  title: "Special Kickers Registration & Waiver",
  description:
    "A safe, inclusive soccer program for athletes of all abilities. Complete the participant, support, medical, consent, and payment information below. Registration is not complete until the $130 fee is successfully paid.",
  participant_mode: "both" as const,
  waiver_text: SPECIAL_KICKERS_WAIVER,
  status: "draft" as const,
  price: {
    label: "Special Kickers Fall 2026 Registration",
    amount_cents: 13000,
    active: true,
  },
  customFields: [
    field("participant_last_name", "Participant Last Name", "name", true),
    field("participant_date_of_birth", "Date of Birth", "date", true),
    field("participant_age", "Age", "number", true),
    field("participant_address", "Address", "short_text", true),
    field("participant_city", "City", "short_text", true),
    field("participant_state", "State", "short_text", true),
    field("participant_zip_code", "ZIP Code", "number", true),
    field("participant_gender", "Gender", "dropdown", false, "all", [
      "Female",
      "Male",
      "Non-binary",
      "Prefer not to say",
    ]),
    field("participant_grade", "Grade", "short_text", false),
    field("diagnosis_disability", "Diagnosis/Disability", "short_text", false),
    field(
      "preferred_communication_method",
      "Preferred Communication Method",
      "dropdown",
      false,
      "all",
      ["Verbal", "Non-verbal", "AAC", "Other"],
    ),
    field("mobility", "Mobility", "dropdown", false, "all", [
      "Independent",
      "Walker",
      "Wheelchair",
      "Other",
    ]),
    field(
      "sensory_behavioral_supports",
      "Sensory/Behavioral Supports",
      "long_text",
      false,
    ),
    field("has_allergies", "Allergies", "dropdown", true, "all", ["Yes", "No"]),
    field("allergy_details", "Allergy Details", "long_text", false),
    field("medical_conditions", "Medical Conditions", "long_text", false),
    field("medications", "Medications", "long_text", false),
    field(
      "has_emergency_medication",
      "Emergency Medication",
      "dropdown",
      true,
      "all",
      ["Yes", "No"],
    ),
    field(
      "emergency_medication_details",
      "Emergency Medication Details",
      "long_text",
      true,
    ),
    field("insurance_provider", "Insurance Provider", "short_text", false),
    field("insurance_policy_number", "Policy Number", "short_text", false),
    field("physician", "Physician", "short_text", false),
    field("physician_phone", "Physician Phone", "phone", false),
    field(
      "previous_soccer_participation",
      "Has the participant played soccer before?",
      "dropdown",
      true,
      "all",
      ["Yes", "No"],
    ),
    field("soccer_experience", "Soccer Experience", "long_text", false),
    field("jersey_size", "Jersey Size", "dropdown", true, "all", [
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
    ]),
    field(
      "guardian_1_last_name",
      "Parent/Guardian #1 Last Name",
      "name",
      true,
      "minor",
    ),
    field(
      "guardian_1_address",
      "Parent/Guardian #1 Address",
      "short_text",
      false,
      "minor",
    ),
    field(
      "guardian_1_relationship",
      "Parent/Guardian #1 Relationship to participant",
      "dropdown",
      true,
      "minor",
      ["Mother", "Father", "Guardian", "Foster Parent", "Other"],
    ),
    field(
      "emergency_contact_last_name",
      "Emergency Contact Last Name",
      "name",
      true,
    ),
    field(
      "guardian_2_first_name",
      "Parent/Guardian #2 First Name",
      "name",
      false,
      "minor",
    ),
    field(
      "guardian_2_last_name",
      "Parent/Guardian #2 Last Name",
      "name",
      false,
      "minor",
    ),
    field(
      "guardian_2_phone",
      "Parent/Guardian #2 Phone Number",
      "phone",
      false,
      "minor",
    ),
    field(
      "guardian_2_email",
      "Parent/Guardian #2 Email",
      "email",
      false,
      "minor",
    ),
    field(
      "guardian_2_address",
      "Parent/Guardian #2 Address",
      "short_text",
      false,
      "minor",
    ),
    field(
      "guardian_2_relationship",
      "Parent/Guardian #2 Relationship to participant",
      "dropdown",
      false,
      "minor",
      ["Mother", "Father", "Guardian", "Foster Parent", "Other"],
    ),
    field(
      "emergency_contact_alternate_phone",
      "Emergency Contact Alternate Phone Number",
      "phone",
      false,
    ),
    field(
      "emergency_contact_relationship",
      "Emergency Contact Relationship",
      "dropdown",
      true,
      "all",
      [
        "Parent/Guardian",
        "Grandparent",
        "Sibling",
        "Aunt/Uncle",
        "Family friend",
        "Other",
      ],
    ),
    field(
      "authorized_pickup_1_name",
      "Authorized Pick-Up #1 - Name",
      "name",
      false,
      "minor",
    ),
    field(
      "authorized_pickup_1_phone",
      "Authorized Pick-Up #1 - Phone",
      "phone",
      false,
      "minor",
    ),
    field(
      "authorized_pickup_2_name",
      "Authorized Pick-Up #2 - Name",
      "name",
      false,
      "minor",
    ),
    field(
      "authorized_pickup_2_phone",
      "Authorized Pick-Up #2 - Phone",
      "phone",
      false,
      "minor",
    ),
    field(
      "photo_video_authorization",
      "May Diverse City FC take and use photographs or videos during practices, games, camps, and club events?",
      "dropdown",
      true,
      "all",
      ["Yes", "No"],
    ),
    field("consent_printed_name", "Consent Printed Name", "name", true),
    field("consent_date", "Consent Date", "date", true),
    field("consent_signature", "Consent Signature", "signature", true),
  ] satisfies RegistrationDraftField[],
};
