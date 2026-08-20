import { z } from "zod";
import { failContract } from "@/lib/contract-error";

export const registrationFieldTypeSchema = z.enum([
  "name",
  "email",
  "phone",
  "date",
  "number",
  "short_text",
  "dropdown",
  "checkbox",
]);

export type RegistrationFieldType = z.infer<typeof registrationFieldTypeSchema>;

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
      if (
        definition.type === "dropdown" &&
        definition.options?.includes(normalized)
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
): RegistrationAnswers {
  const normalizedDefinitions = parseDefinitions(definitions);
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    failContract("INVALID_REGISTRATION_ANSWERS");
  }

  const input = answers as Record<string, unknown>;
  const definitionByKey = new Map(
    normalizedDefinitions.map((definition) => [definition.key, definition]),
  );
  for (const key of Object.keys(input)) {
    if (!definitionByKey.has(key)) {
      failContract("UNKNOWN_REGISTRATION_FIELD", key);
    }
  }

  const normalized: RegistrationAnswers = {};
  for (const definition of normalizedDefinitions) {
    const value = input[definition.key];
    if (definition.required) requiredValue(value, definition);
    if (value === undefined || value === null) continue;
    normalized[definition.key] = normalizeValue(definition, value);
  }
  return normalized;
}

export function buildCoreRegistrationFields(
  isMinor: boolean,
): RegistrationFieldDefinition[] {
  const shared = [
    {
      key: "emergency_contact_name",
      label: "Emergency contact name",
      type: "name" as const,
      required: true,
      isCore: true,
    },
    {
      key: "emergency_contact_phone",
      label: "Emergency contact phone",
      type: "phone" as const,
      required: true,
      isCore: true,
    },
  ];

  return isMinor
    ? [
        { key: "player_name", label: "Player name", type: "name", required: true, isCore: true },
        { key: "guardian_name", label: "Guardian name", type: "name", required: true, isCore: true },
        { key: "guardian_email", label: "Guardian email", type: "email", required: true, isCore: true },
        { key: "guardian_phone", label: "Guardian phone", type: "phone", required: true, isCore: true },
        ...shared,
      ]
    : [
        { key: "registrant_name", label: "Registrant name", type: "name", required: true, isCore: true },
        { key: "registrant_email", label: "Registrant email", type: "email", required: true, isCore: true },
        { key: "registrant_phone", label: "Registrant phone", type: "phone", required: true, isCore: true },
        ...shared,
      ];
}
