"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  Clipboard,
  Radio,
  Square,
  Trash2,
} from "lucide-react";
import { useClubContext } from "@/components/ClubContextProvider";
import {
  formatRegistrationUsd,
  formatRegistrationUsdInput,
  parseRegistrationUsdInput,
} from "@/lib/registration-currency";
import {
  buildCoreRegistrationFields,
  isRegistrationSignatureValue,
  type RegistrationFieldType,
  type RegistrationParticipantMode,
  type RegistrationParticipantScope,
} from "@/lib/registration-fields";
import {
  buildDefaultRegistrationWaiverText,
  REGISTRATION_WAIVER_LEGAL_HINT,
} from "@/lib/registration-waiver";
import { createClient } from "@/lib/admin-client";
import { planRegistrationPricePositionSync } from "@/lib/registration-price-sync";
import { registrationPublicUrl } from "@/lib/registration-public-link";

type FormRow = {
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
type Field = {
  field_key: string;
  label: string;
  field_type: RegistrationFieldType;
  options: string[];
  required: boolean;
  is_core: boolean;
  participant_scope: RegistrationParticipantScope;
  position: number;
};
type StoredPrice = {
  id?: string;
  label: string;
  amount_cents: number;
  active: boolean;
  position: number;
};
type Price = Omit<StoredPrice, "amount_cents"> & { amount: string };
type Registration = {
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
type Draft = {
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
const input =
  "block w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-red-500 focus:ring-2 focus:ring-red-500/25 disabled:cursor-not-allowed disabled:opacity-60";
const button =
  "inline-flex min-h-11 items-center justify-center gap-x-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50";
const types: RegistrationFieldType[] = [
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
function blank(clubName: string): Draft {
  return {
    id: null,
    status: "draft",
    archivedAt: null,
    title: "",
    slug: "",
    description: "",
    participantMode: "adult_only",
    waiver: buildDefaultRegistrationWaiverText(clubName),
    custom: [],
    prices: [{ label: "Registration", amount: "", active: true, position: 0 }],
  };
}

type FormCounts = Record<string, { paid: number; total: number }>;

function formStatusLabel(form: FormRow): "Live" | "Not published" | "Archived" {
  if (form.archived_at) return "Archived";
  return form.status === "open" ? "Live" : "Not published";
}

function registrationName(entry: Registration): string {
  const value = entry.participant_type === "minor"
    ? entry.answers.player_name
    : entry.answers.registrant_name;
  return typeof value === "string" && value.trim()
    ? value
    : entry.registrant_email;
}

function answerText(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function RegistrationsAdminPage() {
  const club = useClubContext();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [formCounts, setFormCounts] = useState<FormCounts>({});
  const [formView, setFormView] = useState<"active" | "archived">("active");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => blank(club.name));
  const [roster, setRoster] = useState<Registration[]>([]);
  const [originalPriceIds, setOriginalPriceIds] = useState<string[]>([]);
  const [connect, setConnect] = useState<{
    connected: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const core = useMemo(
    () =>
      buildCoreRegistrationFields(draft.participantMode).map(
        (field, position) => ({
          field_key: field.key,
          label: field.label,
          field_type: field.type,
          options: [],
          required: true,
          is_core: true,
          participant_scope: field.participantScope ?? "all",
          position,
        }),
      ),
    [draft.participantMode],
  );
  const canEditStructure = draft.status !== "open" && !draft.archivedAt;
  const refresh = useCallback(async () => {
    const client = createClient();
    const [formsResult, registrationsResult] = await Promise.all([
      client
        .from("registration_forms")
        .select("*")
        .order("created_at", { ascending: false }),
      client.from("registrations").select("form_id,status"),
    ]);
    if (formsResult.error || registrationsResult.error) {
      throw new Error(
        formsResult.error?.message ??
          registrationsResult.error?.message ??
          "Could not load registrations.",
      );
    }
    const nextCounts: FormCounts = {};
    for (const row of (registrationsResult.data ?? []) as Array<{
      form_id: string;
      status: Registration["status"];
    }>) {
      const current = nextCounts[row.form_id] ?? { paid: 0, total: 0 };
      current.total += 1;
      if (row.status === "paid") current.paid += 1;
      nextCounts[row.form_id] = current;
    }
    const nextForms = (formsResult.data ?? []) as FormRow[];
    setFormCounts(nextCounts);
    setForms(nextForms);
    return nextForms;
  }, []);
  useEffect(() => {
    Promise.all([
      refresh(),
      fetch("/api/stripe/connect?action=status", {
        credentials: "same-origin",
      }).then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load Stripe Connect status.");
        setConnect(await response.json());
      }),
    ])
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load registrations.",
        ),
      )
      .finally(() => setLoading(false));
  }, [refresh]);
  async function edit(form: FormRow): Promise<boolean> {
    setMessage(null);
    const client = createClient();
    const [fields, prices, entries] = await Promise.all([
      client
        .from("registration_form_fields")
        .select("*")
        .eq("form_id", form.id)
        .order("position"),
      client
        .from("registration_price_options")
        .select("*")
        .eq("form_id", form.id)
        .order("position"),
      client
        .from("registrations")
        .select(
          "id,registrant_email,participant_type,answers,price_label,amount_cents,status,submitted_at,payment_recovery_required,payment_recovery_reason,registrant_email_status,admin_email_status,email_error",
        )
        .eq("form_id", form.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (fields.error || prices.error || entries.error) {
      setMessage("Could not load this form.");
      return false;
    }
    const formPrices = (prices.data ?? []) as StoredPrice[];
    const registrations = ((entries.data ?? []) as Registration[]).filter(
      (entry) =>
        entry.status === "paid" ||
        entry.status === "refunded" ||
        entry.payment_recovery_required,
    );
    setDraft({
      id: form.id,
      status: form.status,
      archivedAt: form.archived_at,
      title: form.title,
      slug: form.slug,
      description: form.description,
      participantMode: form.participant_mode,
      waiver: form.waiver_text,
      custom: ((fields.data ?? []) as Field[]).filter(
        (field) => !field.is_core,
      ),
      prices: formPrices.map(({ amount_cents, ...price }) => ({
        ...price,
        amount: formatRegistrationUsdInput(amount_cents),
      })),
    });
    setOriginalPriceIds(
      formPrices.flatMap((price) => (price.id ? [price.id] : [])),
    );
    setRoster(registrations);
    if (registrations.some((entry) => entry.payment_recovery_required)) {
      setMessage(
        "Payment review required: Stripe reports a completed payment after this registration's expiry. Reconcile it manually before changing the roster.",
      );
    } else if (
      registrations.some(
        (entry) =>
          entry.registrant_email_status === "failed" ||
          entry.admin_email_status === "failed",
      )
    ) {
      setMessage(
        "Notification delivery failed for one or more paid registrations. Review the email status before resending.",
      );
    }
    return true;
  }
  function actionErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      REGISTRATION_FORM_ARCHIVED: "Archived forms are read-only.",
      REGISTRATION_PRICE_OPTION_REQUIRED:
        "Add at least one active price option before publishing.",
      REGISTRATION_CORE_FIELDS_REQUIRED:
        "Complete the required registration fields before publishing.",
      STRIPE_CONNECT_REQUIRED:
        "Connect Stripe and enable charges before publishing a paid form.",
      REGISTRATION_FORM_HAS_REGISTRATIONS:
        "This form has registrants and cannot be deleted. Archive it instead.",
      REGISTRATION_FORM_LINKED:
        "Detach this form from its Program or Tryout before deleting it.",
      REGISTRATION_FORM_IN_USE:
        "This form changed while it was being deleted. Refresh and try again.",
      REGISTRATION_FORM_NOT_FOUND: "This form is no longer available.",
      REGISTRATION_SLUG_CONFLICT:
        "A unique public link could not be created. Try a more specific name.",
    };
    return messages[code] ?? "Could not update this registration form.";
  }

  async function runFormAction(
    form: FormRow,
    action: "publish" | "stop" | "archive" | "delete",
  ) {
    setSaving(true);
    setMessage(null);
    setConfirmDeleteId(null);
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, formId: form.id }),
      });
      const result = (await response.json()) as {
        error?: { code?: string };
      };
      if (!response.ok) {
        throw new Error(actionErrorMessage(result.error?.code ?? ""));
      }

      if (draft.id === form.id) {
        if (action === "delete") {
          setDraft(blank(club.name));
          setRoster([]);
          setOriginalPriceIds([]);
        } else if (action === "archive") {
          setDraft({
            ...draft,
            status: draft.status === "open" ? "closed" : draft.status,
            archivedAt: new Date().toISOString(),
          });
        } else {
          setDraft({
            ...draft,
            status: action === "publish" ? "open" : "closed",
          });
        }
      }
      await refresh();
      if (action === "archive") setFormView("archived");
      setMessage(
        action === "publish"
          ? "Published. This form is accepting registrations."
          : action === "stop"
            ? "Registrations stopped. The public page now shows that registration is closed."
            : action === "archive"
              ? "Archived. Registrant data and CSV export are still available."
              : "Form deleted.",
      );
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update this registration form.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(form: FormRow) {
    try {
      await navigator.clipboard.writeText(
        registrationPublicUrl({
          currentOrigin: window.location.origin,
          primaryDomain: club.primaryDomain,
          formSlug: form.slug,
        }),
      );
      setMessage("Public registration link copied.");
    } catch {
      setMessage("Could not copy the link. Try again from a secure browser.");
    }
  }

  async function saveDraft() {
    setSaving(true);
    setMessage(null);
    try {
      if (draft.id && !canEditStructure) {
        throw new Error(
          draft.archivedAt
            ? "Archived forms are read-only."
            : "Stop registrations before changing fields or prices.",
        );
      }
      if (!draft.prices.some((price) => price.active))
        throw new Error("Keep at least one active price option.");
      const normalizedPrices = draft.prices.map((price, index) => {
        const parsed = parseRegistrationUsdInput(price.amount);
        if (parsed.kind !== "valid") {
          const label = price.label.trim() || `Price option ${index + 1}`;
          throw new Error(
            parsed.kind === "out_of_range"
              ? `${label} must be $1,000,000.00 or less.`
              : `Enter a valid dollar amount for ${label}.`,
          );
        }
        return { ...price, amount_cents: parsed.amountCents };
      });
      const client = createClient();
      const formPayload = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        participant_mode: draft.participantMode,
        waiver_text: draft.waiver.trim(),
      };
      let id = draft.id;
      if (id) {
        const result = await client
          .from("registration_forms")
          .update(formPayload)
          .eq("id", id)
          .select("id")
          .single();
        if (result.error) throw new Error(result.error.message);
      } else {
        const response = await fetch("/api/admin/registrations", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            title: formPayload.title,
            description: formPayload.description,
            participantMode: formPayload.participant_mode,
            waiverText: formPayload.waiver_text,
          }),
        });
        const result = (await response.json()) as {
          form?: { id: string };
          error?: { code?: string };
        };
        if (!response.ok || !result.form) {
          throw new Error(actionErrorMessage(result.error?.code ?? ""));
        }
        id = result.form.id;
      }
      if (!id) throw new Error("Could not resolve the registration form.");
      const deleteFields = await client
        .from("registration_form_fields")
        .delete()
        .eq("form_id", id);
      if (deleteFields.error) throw new Error(deleteFields.error.message);
      const nextFields = [
        ...core,
        ...draft.custom.map((field, index) => ({
          ...field,
          field_key: field.field_key.trim(),
          label: field.label.trim(),
          options:
            field.field_type === "dropdown"
              ? field.options.map((option) => option.trim()).filter(Boolean)
              : [],
          position: core.length + index,
        })),
      ].map((field) => ({ ...field, form_id: id }));
      const fields = await client
        .from("registration_form_fields")
        .insert(nextFields);
      if (fields.error) throw new Error(fields.error.message);
      const retainedIds = new Set(
        draft.prices.flatMap((price) => (price.id ? [price.id] : [])),
      );
      const pricePlan = planRegistrationPricePositionSync(
        originalPriceIds,
        retainedIds,
      );
      for (const price of pricePlan.stage) {
        const staged = await client
          .from("registration_price_options")
          .update({ position: price.position })
          .eq("id", price.id);
        if (staged.error) throw new Error(staged.error.message);
      }
      for (const price of pricePlan.deactivate) {
        const inactive = await client
          .from("registration_price_options")
          .update({ active: false, position: price.position })
          .eq("id", price.id);
        if (inactive.error) throw new Error(inactive.error.message);
      }
      for (const [position, price] of normalizedPrices.entries()) {
        const values = {
          form_id: id,
          label: price.label.trim(),
          amount_cents: price.amount_cents,
          active: price.active,
          position,
        };
        const result = price.id
          ? await client
              .from("registration_price_options")
              .update(values)
              .eq("id", price.id)
          : await client.from("registration_price_options").insert(values);
        if (result.error) throw new Error(result.error.message);
      }
      const nextForms = await refresh();
      const savedForm = nextForms.find((form) => form.id === id);
      if (!savedForm) throw new Error("Could not reload the form.");
      if (!(await edit(savedForm))) {
        throw new Error("Could not load the saved form.");
      }
      setMessage("Form saved.");
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : "Could not save this form.",
      );
    } finally {
      setSaving(false);
    }
  }
  const visibleForms = forms.filter((form) =>
    formView === "archived" ? Boolean(form.archived_at) : !form.archived_at,
  );
  const activeFormCount = forms.filter((form) => !form.archived_at).length;
  const archivedFormCount = forms.length - activeFormCount;
  function answerRows(entry: Registration) {
    const definitions = [...core, ...draft.custom];
    const definitionByKey = new Map(
      definitions.map((field) => [field.field_key, field]),
    );
    return Object.entries(entry.answers).map(([key, value]) => ({
      key,
      label: definitionByKey.get(key)?.label ?? key.replaceAll("_", " "),
      isSignature:
        definitionByKey.get(key)?.field_type === "signature" ||
        isRegistrationSignatureValue(value),
      value,
    }));
  }
  if (loading)
    return <p className="text-sm text-white/50">Loading registrations…</p>;
  return (
    <div className="mx-auto max-w-7xl space-y-7 text-white">
      <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-red-500">
            Registration desk
          </p>
          <h1 className="mt-2 font-display text-4xl font-black uppercase">
            Registrations
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Build forms, collect required consent, and keep a paid roster for
            each program.
          </p>
        </div>
        <button
          className={`${button} bg-red-600 hover:bg-red-500`}
          onClick={() => {
            setFormView("active");
            setConfirmDeleteId(null);
            setDraft(blank(club.name));
            setRoster([]);
            setOriginalPriceIds([]);
          }}
        >
          New form
        </button>
      </header>
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-white/10 bg-white/[.05] p-3 text-sm text-white/80"
        >
          {message}
        </p>
      )}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-white/[.06] to-transparent p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-lg font-bold uppercase">
              Club payment account
            </p>
            <p className="mt-1 text-sm text-white/55">
              {connect?.chargesEnabled
                ? "Charges are enabled for paid registrations."
                : "Free forms work now. Connect Stripe before publishing a paid form."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${connect?.chargesEnabled ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-200"}`}
            >
              {connect?.chargesEnabled ? "Charges enabled" : "Not ready"}
            </span>
            <form action="/api/stripe/connect" method="post">
              <button
                className={`${button} border border-white/20 hover:bg-white/10`}
              >
                {connect?.connected ? "Continue onboarding" : "Connect Stripe"}
              </button>
            </form>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-black uppercase">
              Registration forms
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Publish, stop, archive, or review each form from one place.
            </p>
          </div>
          <div
            className="inline-flex w-full rounded-lg border border-white/10 bg-black/20 p-1 sm:w-auto"
            aria-label="Registration form views"
          >
            <button
              type="button"
              aria-pressed={formView === "active"}
              onClick={() => setFormView("active")}
              className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition sm:flex-none ${
                formView === "active"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/55 hover:text-white"
              }`}
            >
              Forms · {activeFormCount}
            </button>
            <button
              type="button"
              aria-pressed={formView === "archived"}
              onClick={() => setFormView("archived")}
              className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition sm:flex-none ${
                formView === "archived"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/55 hover:text-white"
              }`}
            >
              Archived · {archivedFormCount}
            </button>
          </div>
        </div>
        {visibleForms.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-white/15 px-5 py-8 text-center">
            <p className="font-semibold text-white/75">
              {formView === "archived"
                ? "No archived forms."
                : "No registration forms yet."}
            </p>
            <p className="mt-1 text-sm text-white/40">
              {formView === "archived"
                ? "Forms you archive will keep their registrant records here."
                : "Create a form, add its fields and pricing, then publish it."}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleForms.map((form) => {
              const counts = formCounts[form.id] ?? { paid: 0, total: 0 };
              const status = formStatusLabel(form);
              const selected = draft.id === form.id;
              return (
                <article
                  key={form.id}
                  className={`min-w-0 rounded-xl border border-l-4 bg-black/20 p-4 shadow-sm transition ${
                    selected
                      ? "border-red-500 bg-red-600/10 ring-1 ring-red-500/30"
                      : form.archived_at
                        ? "border-l-white/25 border-y-white/10 border-r-white/10"
                        : form.status === "open"
                          ? "border-l-emerald-400 border-y-white/10 border-r-white/10"
                          : "border-l-amber-300/70 border-y-white/10 border-r-white/10"
                  }`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => void edit(form)}
                      className="min-h-11 min-w-0 flex-1 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <span className="block truncate font-semibold text-white">
                        {form.title}
                      </span>
                      <span className="mt-1 block text-xs text-white/45">
                        {counts.paid} paid {counts.paid === 1 ? "registrant" : "registrants"}
                      </span>
                    </button>
                    <span
                      className={`inline-flex shrink-0 items-center gap-x-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                        status === "Live"
                          ? "bg-emerald-400/15 text-emerald-300"
                          : status === "Archived"
                            ? "bg-white/10 text-white/55"
                            : "bg-amber-300/15 text-amber-100"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${
                          status === "Live"
                            ? "bg-emerald-300"
                            : status === "Archived"
                              ? "bg-white/40"
                              : "bg-amber-200"
                        }`}
                      />
                      {status}
                    </span>
                  </div>
                  {!form.archived_at && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void runFormAction(
                            form,
                            form.status === "open" ? "stop" : "publish",
                          )
                        }
                        className={`${button} ${
                          form.status === "open"
                            ? "border border-amber-300/30 text-amber-100 hover:bg-amber-300/10"
                            : "bg-emerald-600 text-white hover:bg-emerald-500"
                        }`}
                      >
                        {form.status === "open" ? (
                          <Square aria-hidden="true" className="size-4" />
                        ) : (
                          <Radio aria-hidden="true" className="size-4" />
                        )}
                        {form.status === "open" ? "Stop registrations" : "Publish"}
                      </button>
                      {form.status !== "draft" && (
                        <button
                          type="button"
                          onClick={() => void copyLink(form)}
                          className={`${button} border border-white/15 text-white/75 hover:bg-white/[.06]`}
                        >
                          <Clipboard aria-hidden="true" className="size-4" />
                          Copy link
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void runFormAction(form, "archive")}
                        className={`${button} border border-white/15 text-white/75 hover:bg-white/[.06]`}
                      >
                        <Archive aria-hidden="true" className="size-4" />
                        Archive
                      </button>
                      {counts.total === 0 && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setConfirmDeleteId(form.id)}
                          className={`${button} border border-red-400/25 text-red-200 hover:bg-red-500/10`}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                  {confirmDeleteId === form.id && (
                    <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3">
                      <p className="text-sm text-red-100">
                        Permanently delete this empty form? This cannot be undone.
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className={`${button} border border-white/15 text-white/75 hover:bg-white/[.06]`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void runFormAction(form, "delete")}
                          className={`${button} bg-red-600 text-white hover:bg-red-500`}
                        >
                          Delete form
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <main className="min-w-0 space-y-7">
        <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-black uppercase">
                  {draft.id ? "Edit form" : "New form"}
                </h2>
                <p className="mt-1 text-sm text-white/45">
                  Core fields stay required. Add only relevant details.
                </p>
              </div>
              {draft.id && draft.archivedAt && (
                <span className="inline-flex items-center gap-x-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/55">
                  <Archive aria-hidden="true" className="size-3.5" />
                  Archived
                </span>
              )}
            </div>
            {draft.archivedAt && (
              <p className="mb-5 rounded-lg border border-white/15 bg-white/[.05] p-3 text-sm text-white/70">
                Archived forms are read-only. Registrant data and CSV export
                remain available below.
              </p>
            )}
            {!draft.archivedAt && draft.status === "open" && (
              <p className="mb-5 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                Stop registrations from the form card before editing fields or
                prices.
              </p>
            )}
            <fieldset
              disabled={!canEditStructure || saving}
              className="space-y-4 disabled:opacity-60"
            >
              <label className="block text-sm font-medium">
                Form name
                <input
                  className={`${input} mt-1`}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-medium">
                Description
                <textarea
                  className={`${input} mt-1 min-h-24`}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                />
              </label>
              <fieldset className="rounded-xl border border-white/10 p-4">
                <legend className="px-1 text-sm font-semibold">
                  Participant mode
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {([
                    {
                      value: "minor_only",
                      label: "Minor only",
                      hint: "Player and guardian details.",
                    },
                    {
                      value: "adult_only",
                      label: "Adult only",
                      hint: "Self-registrant details.",
                    },
                    {
                      value: "both",
                      label: "Minor or adult",
                      hint: "Registrant chooses the branch.",
                    },
                  ] as const).map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer gap-3 rounded-lg border border-white/10 p-3 has-[:checked]:border-red-500/70 has-[:checked]:bg-red-600/10"
                    >
                      <input
                        type="radio"
                        name="participant-mode"
                        value={option.value}
                        checked={draft.participantMode === option.value}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            participantMode: option.value,
                          })
                        }
                        className="mt-0.5 accent-red-600"
                      />
                      <span>
                        <b className="block text-sm">{option.label}</b>
                        <span className="block text-xs text-white/45">
                          {option.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="block text-sm font-medium">
                  Waiver and consent
                  <textarea
                    aria-describedby="registration-waiver-guidance"
                    className={`${input} mt-1 min-h-64`}
                    value={draft.waiver}
                    onChange={(event) =>
                      setDraft({ ...draft, waiver: event.target.value })
                    }
                  />
                </label>
                <p
                  id="registration-waiver-guidance"
                  className="mt-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2.5 text-sm leading-relaxed text-amber-100"
                >
                  {REGISTRATION_WAIVER_LEGAL_HINT}
                </p>
              </div>
              <div className="border-t border-white/10 pt-6">
                <h3 className="font-display text-xl font-bold uppercase">
                  Required core fields
                </h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {core.map((field) => (
                    <div
                      key={field.field_key}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm"
                    >
                      <span>{field.label}</span>
                      <span className="float-right text-xs text-white/40">
                        required · {field.field_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/10 pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-display text-xl font-bold uppercase">
                      Custom fields
                    </h3>
                    <p className="mt-1 text-sm text-white/45">
                      Keys remain in the CSV export.
                    </p>
                  </div>
                  <button
                    className={`${button} border border-white/20 hover:bg-white/10`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        custom: [
                          ...draft.custom,
                          {
                            field_key: "",
                            label: "",
                            field_type: "short_text",
                            options: [],
                            required: false,
                            is_core: false,
                            participant_scope: "all",
                            position: draft.custom.length,
                          },
                        ],
                      })
                    }
                  >
                    Add field
                  </button>
                </div>
                {draft.custom.map((field, index) => (
                  <div
                    key={index}
                    className="mt-3 rounded-xl border border-white/10 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <input
                        className={input}
                        placeholder="Label"
                        value={field.label}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            custom: draft.custom.map((item, i) =>
                              i === index
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                      <input
                        className={input}
                        placeholder="field_key"
                        value={field.field_key}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            custom: draft.custom.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    field_key: event.target.value
                                      .toLowerCase()
                                      .replace(/[^a-z0-9_]/g, ""),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                      <select
                        className={input}
                        value={field.field_type}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            custom: draft.custom.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    field_type: event.target
                                      .value as RegistrationFieldType,
                                    options: [],
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        {types.map((type) => (
                          <option
                            key={type}
                            value={type}
                            className="bg-zinc-900"
                          >
                            {type.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                      <select
                        className={input}
                        aria-label="Participant branch"
                        value={field.participant_scope}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            custom: draft.custom.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    participant_scope: event.target
                                      .value as RegistrationParticipantScope,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="all" className="bg-zinc-900">
                          Both branches
                        </option>
                        <option value="minor" className="bg-zinc-900">
                          Minors only
                        </option>
                        <option value="adult" className="bg-zinc-900">
                          Adults only
                        </option>
                      </select>
                    </div>
                    {field.field_type === "dropdown" && (
                      <input
                        className={`${input} mt-3`}
                        placeholder="Option 1, Option 2"
                        value={field.options.join(", ")}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            custom: draft.custom.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    options: event.target.value.split(","),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    )}
                    <div className="mt-3 flex justify-between">
                      <label className="text-sm text-white/65">
                        <input
                          className="mr-2 accent-red-600"
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              custom: draft.custom.map((item, i) =>
                                i === index
                                  ? { ...item, required: event.target.checked }
                                  : item,
                              ),
                            })
                          }
                        />
                        Required
                      </label>
                      <button
                        className="text-sm text-red-300"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            custom: draft.custom.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/10 pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-display text-xl font-bold uppercase">
                      Price options
                    </h3>
                    <p className="mt-1 text-sm text-white/45">
                      Enter dollars. Removed options stay inactive for payment
                      history.
                    </p>
                  </div>
                  <button
                    className={`${button} border border-white/20 hover:bg-white/10`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        prices: [
                          ...draft.prices,
                          {
                            label: "",
                            amount: "",
                            active: true,
                            position: draft.prices.length,
                          },
                        ],
                      })
                    }
                  >
                    Add price
                  </button>
                </div>
                {draft.prices.map((price, index) => (
                  <div
                    className="mt-3 grid min-w-0 gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto] sm:items-center sm:border-0 sm:p-0"
                    key={price.id ?? index}
                  >
                    <input
                      className={input}
                      placeholder="Registration fee"
                      value={price.label}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          prices: draft.prices.map((item, i) =>
                            i === index
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <label className="relative block">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-white/45">
                        $
                      </span>
                      <input
                        aria-label={`${price.label || `Price option ${index + 1}`} amount in dollars`}
                        className={`${input} pl-7 tabular-nums`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={price.amount}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            prices: draft.prices.map((item, i) =>
                              i === index
                                ? { ...item, amount: event.target.value }
                                : item,
                            ),
                          })
                        }
                        onBlur={() => {
                          const parsed = parseRegistrationUsdInput(price.amount);
                          if (parsed.kind !== "valid") return;
                          setDraft({
                            ...draft,
                            prices: draft.prices.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    amount: formatRegistrationUsdInput(
                                      parsed.amountCents,
                                    ),
                                  }
                                : item,
                            ),
                          });
                        }}
                      />
                    </label>
                    <label className="flex min-h-11 items-center text-sm text-white/65">
                      <input
                        className="mr-2 accent-red-600"
                        type="checkbox"
                        checked={price.active}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            prices: draft.prices.map((item, i) =>
                              i === index
                                ? { ...item, active: event.target.checked }
                                : item,
                            ),
                          })
                        }
                      />
                      Active
                    </label>
                    <button
                      className={`${button} px-2 text-red-300 hover:bg-red-500/10`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          prices: draft.prices.filter((_, i) => i !== index),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="mt-7 flex justify-end border-t border-white/10 pt-5">
              <button
                disabled={saving || !canEditStructure}
                onClick={saveDraft}
                className={`${button} bg-red-600 hover:bg-red-500`}
              >
                {saving ? "Saving…" : "Save form"}
              </button>
            </div>
          </section>
        {draft.id && (
          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-2xl font-black uppercase">
                  Registrants
                </h2>
                <p className="mt-1 text-sm text-white/45">
                  Paid and refunded registrations only. Pending and expired
                  attempts stay out.
                </p>
              </div>
              <a
                className={`${button} w-full border border-white/20 hover:bg-white/10 sm:w-auto`}
                href={`/api/admin/registrations/export?formId=${draft.id}`}
              >
                Export CSV
              </a>
            </div>

            {roster.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-white/40">
                No paid registrations yet.
              </p>
            ) : (
              <>
                <div className="mt-5 space-y-3 md:hidden">
                  {roster.map((entry) => {
                    const recovery = entry.payment_recovery_required;
                    return (
                      <details
                        key={entry.id}
                        className="group min-w-0 rounded-xl border border-white/10 bg-black/20 open:border-white/20"
                      >
                        <summary className="flex min-h-14 cursor-pointer list-none items-start justify-between gap-3 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500 [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-white">
                              {registrationName(entry)}
                            </span>
                            <span className="mt-1 block text-xs text-white/45">
                              {formatRegistrationUsd(entry.amount_cents)} · {new Date(
                                entry.submitted_at,
                              ).toLocaleDateString()}
                            </span>
                          </span>
                          <span
                            className={`inline-flex shrink-0 items-center gap-x-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                              recovery
                                ? "bg-red-400/15 text-red-200"
                                : entry.status === "paid"
                                  ? "bg-emerald-400/15 text-emerald-300"
                                  : "bg-amber-300/15 text-amber-100"
                            }`}
                          >
                            {!recovery && entry.status === "paid" && (
                              <Check aria-hidden="true" className="size-3.5" />
                            )}
                            {recovery
                              ? "Review"
                              : entry.status === "paid"
                                ? "Paid"
                                : "Refunded"}
                          </span>
                        </summary>
                        <div className="border-t border-white/10 px-4 py-4">
                          {recovery && (
                            <p className="mb-4 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
                              Payment completion needs manual review before this
                              record is treated as confirmed.
                            </p>
                          )}
                          <dl className="space-y-3">
                            {answerRows(entry).map((answer) => (
                              <div key={answer.key} className="min-w-0">
                                <dt className="text-xs font-bold uppercase tracking-wide text-white/40">
                                  {answer.label}
                                </dt>
                                <dd className="mt-1 break-words text-sm text-white/80">
                                  {answer.isSignature
                                    ? "Signature captured"
                                    : answerText(answer.value)}
                                </dd>
                              </div>
                            ))}
                            <div>
                              <dt className="text-xs font-bold uppercase tracking-wide text-white/40">
                                Email
                              </dt>
                              <dd className="mt-1 break-all text-sm text-white/80">
                                {entry.registrant_email}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-bold uppercase tracking-wide text-white/40">
                                Price paid
                              </dt>
                              <dd className="mt-1 text-sm text-white/80">
                                {entry.price_label} · {formatRegistrationUsd(
                                  entry.amount_cents,
                                )}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </details>
                    );
                  })}
                </div>

                <div className="mt-5 hidden md:block">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
                      <tr>
                        <th className="w-[34%] px-3 py-3">Registrant</th>
                        <th className="w-[30%] px-3 py-3">Price</th>
                        <th className="w-[16%] px-3 py-3">Status</th>
                        <th className="w-[20%] px-3 py-3">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((entry) => (
                        <tr key={entry.id} className="border-b border-white/5">
                          <td className="px-3 py-3 align-top">
                            <span className="block break-words font-medium">
                              {registrationName(entry)}
                            </span>
                            <span className="mt-0.5 block break-all text-xs text-white/45">
                              {entry.registrant_email}
                            </span>
                          </td>
                          <td className="break-words px-3 py-3 align-top">
                            {entry.price_label} · {formatRegistrationUsd(
                              entry.amount_cents,
                            )}
                          </td>
                          <td
                            className={`px-3 py-3 align-top font-semibold ${
                              entry.payment_recovery_required
                                ? "text-red-200"
                                : entry.status === "paid"
                                  ? "text-emerald-300"
                                  : "text-amber-200"
                            }`}
                          >
                            {entry.payment_recovery_required
                              ? "Review"
                              : entry.status === "paid"
                                ? "Paid"
                                : "Refunded"}
                          </td>
                          <td className="px-3 py-3 align-top text-white/55">
                            {new Date(entry.submitted_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
