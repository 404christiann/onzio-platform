"use client";

import { useEffect, useMemo, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import {
  buildCoreRegistrationFields,
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

type FormRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  participant_mode: RegistrationParticipantMode;
  waiver_text: string;
  status: "draft" | "open" | "closed";
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
type Price = {
  id?: string;
  label: string;
  amount_cents: number;
  active: boolean;
  position: number;
};
type Registration = {
  id: string;
  registrant_email: string;
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
  title: string;
  slug: string;
  description: string;
  participantMode: RegistrationParticipantMode;
  waiver: string;
  custom: Field[];
  prices: Price[];
};
const input =
  "w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-red-500";
const button =
  "rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50";
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
    title: "",
    slug: "",
    description: "",
    participantMode: "adult_only",
    waiver: buildDefaultRegistrationWaiverText(clubName),
    custom: [],
    prices: [
      { label: "Registration", amount_cents: 0, active: true, position: 0 },
    ],
  };
}

export default function RegistrationsAdminPage() {
  const club = useClubContext();
  const [forms, setForms] = useState<FormRow[]>([]);
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
  const paid = draft.prices.some(
    (price) => price.active && Number(price.amount_cents) > 0,
  );
  const canEditStructure = draft.status !== "open";
  async function refresh() {
    const client = createClient();
    const result = await client
      .from("registration_forms")
      .select("*")
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    setForms((result.data ?? []) as FormRow[]);
  }
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
  }, []);
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
          "id,registrant_email,price_label,amount_cents,status,submitted_at,payment_recovery_required,payment_recovery_reason,registrant_email_status,admin_email_status,email_error",
        )
        .eq("form_id", form.id)
        .order("submitted_at", { ascending: false }),
    ]);
    if (fields.error || prices.error || entries.error) {
      setMessage("Could not load this form.");
      return false;
    }
    const formPrices = (prices.data ?? []) as Price[];
    const registrations = ((entries.data ?? []) as Registration[]).filter(
      (entry) =>
        entry.status === "paid" ||
        entry.status === "refunded" ||
        entry.payment_recovery_required,
    );
    setDraft({
      id: form.id,
      status: form.status,
      title: form.title,
      slug: form.slug,
      description: form.description,
      participantMode: form.participant_mode,
      waiver: form.waiver_text,
      custom: ((fields.data ?? []) as Field[]).filter(
        (field) => !field.is_core,
      ),
      prices: formPrices,
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
  async function setStatus(status: "open" | "closed") {
    if (!draft.id) return;
    setSaving(true);
    setMessage(null);
    try {
      if (status === "open" && paid && !connect?.chargesEnabled)
        throw new Error(
          "Stripe must enable charges before a paid form can open.",
        );
      const result = await createClient()
        .from("registration_forms")
        .update({
          status,
          closed_at: status === "closed" ? new Date().toISOString() : null,
        })
        .eq("id", draft.id);
      if (result.error) throw new Error(result.error.message);
      setDraft({ ...draft, status });
      await refresh();
      setMessage(
        status === "open"
          ? "Form is open for registrations."
          : "Form closed. Existing Checkout sessions may complete.",
      );
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update form status.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveDraft() {
    setSaving(true);
    setMessage(null);
    try {
      if (draft.id && !canEditStructure)
        throw new Error("Close this form before changing fields or prices.");
      if (!draft.prices.some((price) => price.active))
        throw new Error("Keep at least one active price option.");
      const client = createClient();
      const formPayload = {
        title: draft.title.trim(),
        slug: draft.slug.trim(),
        description: draft.description.trim(),
        participant_mode: draft.participantMode,
        waiver_text: draft.waiver.trim(),
        status: "draft",
        closed_at: null,
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
        const result = await client
          .from("registration_forms")
          .insert(formPayload)
          .select("id")
          .single();
        if (result.error || !result.data)
          throw new Error(
            result.error?.message ?? "Could not create the form.",
          );
        id = (result.data as { id: string }).id;
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
      for (const [position, price] of draft.prices.entries()) {
        const values = {
          form_id: id,
          label: price.label.trim(),
          amount_cents: Number(price.amount_cents),
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
      await refresh();
      const savedForm = await client
        .from("registration_forms")
        .select("*")
        .eq("id", id)
        .single();
      if (savedForm.error || !savedForm.data)
        throw new Error(
          savedForm.error?.message ?? "Could not reload the form.",
        );
      if (!(await edit(savedForm.data as FormRow))) {
        throw new Error("Could not load the saved form.");
      }
      setMessage("Draft saved.");
    } catch (error: unknown) {
      setMessage(
        error instanceof Error ? error.message : "Could not save this form.",
      );
    } finally {
      setSaving(false);
    }
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
            setDraft(blank(club.name));
            setRoster([]);
            setOriginalPriceIds([]);
          }}
        >
          New form
        </button>
      </header>
      {message && (
        <p className="rounded-lg border border-white/10 bg-white/[.05] p-3 text-sm text-white/80">
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
                : "Free forms work now. Connect Stripe before opening a paid form."}
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
      <div className="grid gap-7 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-white/10 bg-white/[.03] p-3">
          <p className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-white/40">
            Forms
          </p>
          {forms.length === 0 && (
            <p className="p-3 text-sm text-white/45">No forms yet.</p>
          )}
          {forms.map((form) => (
            <button
              key={form.id}
              onClick={() => {
                void edit(form);
              }}
              className={`mb-1 w-full rounded-xl p-3 text-left hover:bg-white/[.06] ${draft.id === form.id ? "bg-red-600/20 ring-1 ring-red-500/40" : ""}`}
            >
              <span className="block truncate font-semibold">{form.title}</span>
              <span className="flex justify-between pt-1 text-xs text-white/45">
                <span>/{form.slug}</span>
                <span
                  className={
                    form.status === "open"
                      ? "text-emerald-300"
                      : form.status === "closed"
                        ? "text-amber-200"
                        : ""
                  }
                >
                  {form.status}
                </span>
              </span>
            </button>
          ))}
        </aside>
        <main className="space-y-7">
          <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-black uppercase">
                  {draft.id ? "Edit form" : "New form"}
                </h2>
                <p className="mt-1 text-sm text-white/45">
                  Core fields stay required. Add only relevant details.
                </p>
              </div>
              {draft.id && (
                <div className="flex gap-2">
                  <button
                    disabled={saving || (paid && !connect?.chargesEnabled)}
                    onClick={() => setStatus("open")}
                    className={`${button} bg-emerald-600 hover:bg-emerald-500`}
                  >
                    Open
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => setStatus("closed")}
                    className={`${button} border border-amber-300/30 text-amber-100 hover:bg-amber-300/10`}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
            {!canEditStructure && (
              <p className="mb-5 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                Close this form before editing fields or prices. Opening only
                changes status.
              </p>
            )}
            <fieldset
              disabled={!canEditStructure || saving}
              className="space-y-4 disabled:opacity-60"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Form name
                  <input
                    className={`${input} mt-1`}
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                </label>
                <label className="text-sm font-medium">
                  Public slug
                  <input
                    className={`${input} mt-1`}
                    value={draft.slug}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        slug: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, ""),
                      })
                    }
                  />
                </label>
              </div>
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
                <div className="flex items-center justify-between">
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
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-xl font-bold uppercase">
                      Price options
                    </h3>
                    <p className="mt-1 text-sm text-white/45">
                      Amounts are in cents. Removed options are retained as
                      inactive history.
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
                            amount_cents: 0,
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
                    className="mt-3 grid grid-cols-[1fr_110px_auto_auto] items-center gap-3"
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
                    <input
                      className={input}
                      type="number"
                      min="0"
                      value={price.amount_cents}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          prices: draft.prices.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  amount_cents: Number(event.target.value),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                    <label className="text-sm text-white/65">
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
                      className="text-sm text-red-300"
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
                {saving ? "Saving…" : "Save draft"}
              </button>
            </div>
          </section>
          {draft.id && (
            <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-black uppercase">
                    Paid roster
                  </h2>
                  <p className="mt-1 text-sm text-white/45">
                    Paid and refunded registrations only. Pending and expired
                    starts stay out.
                  </p>
                </div>
                <a
                  className={`${button} border border-white/20 hover:bg-white/10`}
                  href={`/api/admin/registrations/export?formId=${draft.id}`}
                >
                  Export CSV
                </a>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
                    <tr>
                      <th className="px-3 py-3">Registrant</th>
                      <th className="px-3 py-3">Price</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.length === 0 ? (
                      <tr>
                        <td
                          className="px-3 py-8 text-center text-white/40"
                          colSpan={4}
                        >
                          No paid registrations yet.
                        </td>
                      </tr>
                    ) : (
                      roster.map((entry) => (
                        <tr key={entry.id} className="border-b border-white/5">
                          <td className="px-3 py-3">
                            {entry.registrant_email}
                          </td>
                          <td className="px-3 py-3">
                            {entry.price_label} · $
                            {(entry.amount_cents / 100).toFixed(2)}
                          </td>
                          <td
                            className={`px-3 py-3 ${entry.status === "paid" ? "text-emerald-300" : "text-amber-200"}`}
                          >
                            {entry.status}
                          </td>
                          <td className="px-3 py-3 text-white/55">
                            {new Date(entry.submitted_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
