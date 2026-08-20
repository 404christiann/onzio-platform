import type { OpenRegistrationForm } from "@/lib/registration-service";
import type { RegistrationFieldDefinition } from "@/lib/registration-fields";

export type PublicRegistrationForm = {
  slug: string;
  title: string;
  description: string;
  waiverText: string;
  fields: RegistrationFieldDefinition[];
  prices: Array<{ id: string; label: string; amountCents: number }>;
};

/** Removes tenant and payment-configuration details before crossing into the public UI. */
export function toPublicRegistrationForm(
  aggregate: OpenRegistrationForm,
): PublicRegistrationForm {
  return {
    slug: aggregate.form.slug,
    title: aggregate.form.title,
    description: aggregate.form.description,
    waiverText: aggregate.form.waiver_text,
    fields: aggregate.fields.map((field) => ({
      key: field.field_key,
      label: field.label,
      type: field.field_type as RegistrationFieldDefinition["type"],
      required: field.required,
      options: field.field_type === "dropdown"
        ? (Array.isArray(field.options)
            ? field.options.filter((option): option is string => typeof option === "string")
            : [])
        : undefined,
      isCore: field.is_core,
    })),
    prices: aggregate.prices.map((price) => ({
      id: price.id,
      label: price.label,
      amountCents: price.amount_cents,
    })),
  };
}

export function formatRegistrationPrice(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100);
}
