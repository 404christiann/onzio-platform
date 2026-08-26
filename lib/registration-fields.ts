import { z } from "zod";
import { failContract } from "@/lib/contract-error";

export const registrationFieldTypeSchema = z.enum([
  "name",
  "email",
  "phone",
  "date",
  "number",
  "short_text",
  "long_text",
  "dropdown",
  "checkbox",
  "signature",
]);

export type RegistrationFieldType = z.infer<typeof registrationFieldTypeSchema>;

export const registrationParticipantModeSchema = z.enum([
  "minor_only",
  "adult_only",
  "both",
]);

export type RegistrationParticipantMode = z.infer<
  typeof registrationParticipantModeSchema
>;

export const registrationParticipantTypeSchema = z.enum(["minor", "adult"]);

export type RegistrationParticipantType = z.infer<
  typeof registrationParticipantTypeSchema
>;

export const registrationParticipantScopeSchema = z.enum([
  "all",
  "minor",
  "adult",
]);

export type RegistrationParticipantScope = z.infer<
  typeof registrationParticipantScopeSchema
>;

export const REGISTRATION_PARTICIPANT_QUESTION =
  "Is this registration for a minor or an adult?";

const fieldKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/);

export const registrationFieldDefinitionSchema = z
  .object({
    key: fieldKeySchema,
    label: z.string().trim().min(1).max(120),
    type: registrationFieldTypeSchema,
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    isCore: z.boolean().optional(),
    participantScope: registrationParticipantScopeSchema.optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    if (definition.type === "dropdown") {
      if (!definition.options || definition.options.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "Dropdown fields require at least one option.",
        });
      } else if (
        new Set(definition.options.map((option) => option.toLocaleLowerCase()))
          .size !== definition.options.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "Dropdown options must be unique.",
        });
      }
    } else if (definition.options !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Only dropdown fields may define options.",
      });
    }
  });

export type RegistrationFieldDefinition = z.input<
  typeof registrationFieldDefinitionSchema
>;

export const registrationFieldDefinitionsSchema = z
  .array(registrationFieldDefinitionSchema)
  .min(1)
  .max(100)
  .superRefine((definitions, context) => {
    const keys = new Set<string>();
    for (const [index, definition] of definitions.entries()) {
      if (keys.has(definition.key)) {
        context.addIssue({
          code: "custom",
          path: [index, "key"],
          message: "Field keys must be unique.",
        });
      }
      keys.add(definition.key);
    }
  });

export type RegistrationAnswers = Record<string, string | number | boolean>;

const REGISTRATION_SIGNATURE_PATTERN =
  /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export function isRegistrationSignatureValue(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 200000 &&
    REGISTRATION_SIGNATURE_PATTERN.test(value);
}

function parseDefinitions(
  definitions: readonly RegistrationFieldDefinition[],
): RegistrationFieldDefinition[] {
  const parsed = registrationFieldDefinitionsSchema.safeParse(definitions);
  if (!parsed.success) {
    const duplicateKey = parsed.error.issues.some(
      (issue) => issue.message === "Field keys must be unique.",
    );
    failContract(
      duplicateKey
        ? "DUPLICATE_REGISTRATION_FIELD_KEY"
        : "INVALID_REGISTRATION_FIELD_DEFINITION",
    );
  }
  return parsed.data;
}

function requiredValue(value: unknown, definition: RegistrationFieldDefinition) {
  if (value === undefined || value === null) {
    failContract("REGISTRATION_FIELD_REQUIRED", definition.key);
  }
  if (typeof value === "string" && value.trim() === "") {
    failContract("REGISTRATION_FIELD_REQUIRED", definition.key);
  }
  if (definition.type === "checkbox" && value !== true) {
    failContract("REGISTRATION_FIELD_REQUIRED", definition.key);
  }
}

function normalizedIsoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? value
    : null;
}

function normalizeValue(
  definition: RegistrationFieldDefinition,
  value: unknown,
): string | number | boolean {
  switch (definition.type) {
    case "number":
      if (typeof value === "number" && Number.isFinite(value)) return value;
      break;
    case "checkbox":
      if (typeof value === "boolean") return value;
      break;
    default: {
      if (typeof value !== "string") break;
      const normalized = value.trim();
      if (definition.type === "email" && z.email().safeParse(normalized).success) {
        return normalized;
      }
      if (
        definition.type === "phone" &&
        /^\+?[0-9][0-9().\-\s]{5,24}$/.test(normalized)
      ) {
        return normalized;
      }
      if (definition.type === "date" && normalizedIsoDate(normalized)) {
        return normalized;
      }
      if (
        (definition.type === "name" || definition.type === "short_text") &&
        normalized.length <= 500
      ) {
        return normalized;
      }
      if (definition.type === "long_text" && normalized.length <= 10000) {
        return normalized;
      }
      if (
        definition.type === "dropdown" &&
        definition.options?.includes(normalized)
      ) {
        return normalized;
      }
      if (
        definition.type === "signature" &&
        isRegistrationSignatureValue(normalized)
      ) {
        return normalized;
      }
    }
  }
  failContract("INVALID_REGISTRATION_FIELD_VALUE", definition.key);
}

/** Validates untrusted registration answers against the server-owned definition. */
export function validateRegistrationAnswers(
  definitions: readonly RegistrationFieldDefinition[],
  answers: unknown,
  participantType?: RegistrationParticipantType,
): RegistrationAnswers {
  const normalizedDefinitions = parseDefinitions(definitions);
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    failContract("INVALID_REGISTRATION_ANSWERS");
  }

  const input = answers as Record<string, unknown>;
  const activeDefinitions = participantType
    ? normalizedDefinitions.filter((definition) =>
        registrationFieldAppliesToParticipant(definition, participantType),
      )
    : normalizedDefinitions;
  const definitionByKey = new Map(
    activeDefinitions.map((definition) => [definition.key, definition]),
  );
  for (const key of Object.keys(input)) {
    if (!definitionByKey.has(key)) {
      const knownDefinition = normalizedDefinitions.some(
        (definition) => definition.key === key,
      );
      failContract(
        knownDefinition
          ? "REGISTRATION_FIELD_NOT_APPLICABLE"
          : "UNKNOWN_REGISTRATION_FIELD",
        key,
      );
    }
  }

  const normalized: RegistrationAnswers = {};
  for (const definition of activeDefinitions) {
    const value = input[definition.key];
    if (definition.required) requiredValue(value, definition);
    if (value === undefined || value === null) continue;
    normalized[definition.key] = normalizeValue(definition, value);
  }
  return normalized;
}

export function resolveRegistrationParticipantType(
  participantMode: RegistrationParticipantMode,
  selectedType?: RegistrationParticipantType,
): RegistrationParticipantType {
  if (participantMode === "both") {
    if (!selectedType) failContract("REGISTRATION_PARTICIPANT_TYPE_REQUIRED");
    return selectedType;
  }

  const resolved = participantMode === "minor_only" ? "minor" : "adult";
  if (selectedType && selectedType !== resolved) {
    failContract("REGISTRATION_PARTICIPANT_TYPE_INVALID");
  }
  return resolved;
}

export function registrationFieldAppliesToParticipant(
  definition: Pick<RegistrationFieldDefinition, "participantScope">,
  participantType: RegistrationParticipantType,
): boolean {
  const scope = definition.participantScope ?? "all";
  return scope === "all" || scope === participantType;
}

export function buildCoreRegistrationFields(
  participantMode: RegistrationParticipantMode,
): RegistrationFieldDefinition[] {
  const shared = [
    {
      key: "emergency_contact_name",
      label: "Emergency contact name",
      type: "name" as const,
      required: true,
      isCore: true,
      participantScope: "all" as const,
    },
    {
      key: "emergency_contact_phone",
      label: "Emergency contact phone",
      type: "phone" as const,
      required: true,
      isCore: true,
      participantScope: "all" as const,
    },
  ];

  const minor = [
    { key: "player_name", label: "Player name", type: "name" as const, required: true, isCore: true, participantScope: "minor" as const },
    { key: "guardian_name", label: "Guardian name", type: "name" as const, required: true, isCore: true, participantScope: "minor" as const },
    { key: "guardian_email", label: "Guardian email", type: "email" as const, required: true, isCore: true, participantScope: "minor" as const },
    { key: "guardian_phone", label: "Guardian phone", type: "phone" as const, required: true, isCore: true, participantScope: "minor" as const },
  ];
  const adult = [
    { key: "registrant_name", label: "Registrant name", type: "name" as const, required: true, isCore: true, participantScope: "adult" as const },
    { key: "registrant_email", label: "Registrant email", type: "email" as const, required: true, isCore: true, participantScope: "adult" as const },
    { key: "registrant_phone", label: "Registrant phone", type: "phone" as const, required: true, isCore: true, participantScope: "adult" as const },
  ];

  if (participantMode === "minor_only") return [...minor, ...shared];
  if (participantMode === "adult_only") return [...adult, ...shared];
  return [...minor, ...adult, ...shared];
}
