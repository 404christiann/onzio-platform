import { NEW_REGISTRATION_FORM_PARTICIPANT_MODE,type RegistrationFieldType,type RegistrationParticipantMode,type RegistrationParticipantScope } from "@/lib/registration-fields";
import { buildDefaultRegistrationWaiverText } from "@/lib/registration-waiver";
export type FormRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  participant_mode: RegistrationParticipantMode;
  waiver_text: string;
  status: "draft" | "open" | "closed";
  archived_at: string | null;
  created_at: string;
};
export type Field = {
  field_key: string;
  label: string;
  field_type: RegistrationFieldType;
  options: string[];
  required: boolean;
  is_core: boolean;
  participant_scope: RegistrationParticipantScope;
  position: number;
};
export function registrationFieldInsertRows(
  formId: string,
  core: readonly Field[],
  custom: readonly Field[],
): Array<Field & { form_id: string }> {
  return [...core, ...custom].map((field, position) => ({
    form_id: formId,
    field_key: field.is_core ? field.field_key : field.field_key.trim(),
    label: field.is_core ? field.label : field.label.trim(),
    field_type: field.field_type,
    options: field.field_type === "dropdown"
      ? field.options.map((option) => option.trim()).filter(Boolean)
      : [],
    required: field.required,
    is_core: field.is_core,
    participant_scope: field.participant_scope,
    position,
  }));
}
export type StoredPrice = {
  id?: string;
  label: string;
  amount_cents: number;
  active: boolean;
  position: number;
};
export type Price = Omit<StoredPrice, "amount_cents"> & { amount: string };
export type Registration = {
  id: string;
  registrant_email: string;
  participant_type: "minor" | "adult";
  answers: Record<string, string | number | boolean>;
  price_label: string;
  amount_cents: number;
  status: "paid" | "refunded" | "pending" | "expired";
  submitted_at: string;
  payment_recovery_required: boolean;
  payment_recovery_reason: string | null;
  registrant_email_status: string;
  admin_email_status: string;
  email_error: string | null;
};
export type Draft = {
  id: string | null;
  status: "draft" | "open" | "closed";
  archivedAt: string | null;
  title: string;
  slug: string;
  description: string;
  participantMode: RegistrationParticipantMode;
  waiver: string;
  custom: Field[];
  prices: Price[];
};
export const input =
  "block min-h-11 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
export const button =
  "inline-flex min-h-11 items-center justify-center gap-x-2 rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50";
export const types: RegistrationFieldType[] = [
  "short_text",
  "long_text",
  "name",
  "email",
  "phone",
  "date",
  "number",
  "dropdown",
  "checkbox",
  "signature",
];
export function blank(clubName: string): Draft {
  return {
    id: null,
    status: "draft",
    archivedAt: null,
    title: "",
    slug: "",
    description: "",
    participantMode: NEW_REGISTRATION_FORM_PARTICIPANT_MODE,
    waiver: buildDefaultRegistrationWaiverText(clubName),
    custom: [],
    prices: [{ label: "Registration", amount: "", active: true, position: 0 }],
  };
}

export type FormCounts = Record<string, { paid: number; total: number }>;

export function formStatusLabel(form: FormRow): "Live" | "Not published" | "Archived" {
  if (form.archived_at) return "Archived";
  return form.status === "open" ? "Live" : "Not published";
}

export function registrationName(entry: Registration): string {
  const value = entry.participant_type === "minor"
    ? entry.answers.player_name
    : entry.answers.registrant_name;
  return typeof value === "string" && value.trim()
    ? value
    : entry.registrant_email;
}

export function answerText(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

