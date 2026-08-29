"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Radio,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import { AdminTabs } from "@/components/admin/AdminTabs";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedLoading } from "@/lib/use-delayed-loading";
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
  "block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const button =
  "inline-flex min-h-11 items-center justify-center gap-x-2 rounded-lg px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50";
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
  const [formTab, setFormTab] = useState<"build" | "registrants">("build");
  const [rosterFilter, setRosterFilter] = useState<
    "all" | "paid" | "refunded" | "review"
  >("all");
  const [rosterQuery, setRosterQuery] = useState("");
  const [waiverExpanded, setWaiverExpanded] = useState(true);
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
  const showFullLoader = useDelayedLoading(loading, 400);
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
    setFormTab("build");
    setRosterFilter("all");
    setRosterQuery("");
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
          setFormTab("build");
          setRosterFilter("all");
          setRosterQuery("");
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
  const selectedFormRow = forms.find((form) => form.id === draft.id) ?? null;
  const recoveryCount = roster.filter(
    (entry) => entry.payment_recovery_required,
  ).length;
  const paidCount = roster.filter(
    (entry) => entry.status === "paid" && !entry.payment_recovery_required,
  ).length;
  const refundedCount = roster.filter(
    (entry) => entry.status === "refunded" && !entry.payment_recovery_required,
  ).length;
  const collectedCents = roster
    .filter((entry) => entry.status === "paid" && !entry.payment_recovery_required)
    .reduce((total, entry) => total + entry.amount_cents, 0);
  const visibleRoster = roster
    .filter((entry) => {
      if (rosterFilter === "paid")
        return entry.status === "paid" && !entry.payment_recovery_required;
      if (rosterFilter === "refunded")
        return entry.status === "refunded" && !entry.payment_recovery_required;
      if (rosterFilter === "review") return entry.payment_recovery_required;
      return true;
    })
    .filter((entry) => {
      const query = rosterQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        registrationName(entry).toLowerCase().includes(query) ||
        entry.registrant_email.toLowerCase().includes(query)
      );
    });
  if (loading)
    return showFullLoader ? (
      <AdminFullPageLoader label="Loading registrations" />
    ) : (
      <AdminPage>
        <AdminPageHeader
          eyebrow="Registration desk"
          title="Registrations"
          description="Build forms, collect required consent, and keep a paid roster for each program."
        />
        <div
          className="flex flex-col gap-3"
          role="status"
          aria-label="Loading registrations"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1 space-y-2.5">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      </AdminPage>
    );
  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Registration desk"
        title="Registrations"
        description="Build forms, collect required consent, and keep a paid roster for each program."
        actions={
          <>
            <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Club payment account
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${connect?.chargesEnabled ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
              >
                {connect?.chargesEnabled ? "Charges enabled" : "Not ready"}
              </span>
            </div>
            <button
              className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
              onClick={() => {
                setFormView("active");
                setConfirmDeleteId(null);
                setDraft(blank(club.name));
                setRoster([]);
                setOriginalPriceIds([]);
                setFormTab("build");
                setRosterFilter("all");
                setRosterQuery("");
              }}
            >
              New form
            </button>
          </>
        }
      />
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-border bg-card p-3 text-sm text-card-foreground shadow-sm"
        >
          {message}
        </p>
      )}
      {!connect?.chargesEnabled && (
        <AdminPanel className="overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <span className="grid size-9 flex-none place-items-center rounded-lg bg-foreground text-xs font-bold text-background">
              S
            </span>
            <div>
              <p className="font-display text-sm font-bold uppercase">
                Club payment account
              </p>
              <p className="text-xs text-muted-foreground">Payments by Stripe</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-x-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning">
              Not ready
            </span>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: "Account connected", done: Boolean(connect?.connected) },
              { label: "Charges enabled", done: Boolean(connect?.chargesEnabled) },
              { label: "Payouts enabled", done: Boolean(connect?.payoutsEnabled) },
            ].map((step) => (
              <div
                key={step.label}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                {step.done ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 flex-none rounded-full bg-success/10 p-0.5 text-success"
                  />
                ) : (
                  <AlertCircle
                    aria-hidden="true"
                    className="size-4 flex-none rounded-full bg-warning/10 p-0.5 text-warning"
                  />
                )}
                <span className="text-sm text-foreground">{step.label}</span>
                {!step.done && (
                  <span className="ml-auto text-xs font-semibold text-warning">
                    Pending
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-muted-foreground">
              Free forms work now. Connect Stripe before publishing a paid
              form.
            </p>
            <form action="/api/stripe/connect" method="post">
              <button
                className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
              >
                {connect?.connected ? "Continue onboarding" : "Connect Stripe"}
              </button>
            </form>
          </div>
        </AdminPanel>
      )}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-24">
          <div
            className="inline-flex w-full rounded-lg border border-border bg-muted/50 p-1"
            aria-label="Registration form views"
          >
            <button
              type="button"
              aria-pressed={formView === "active"}
              onClick={() => setFormView("active")}
              className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition ${
                formView === "active"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Forms · {activeFormCount}
            </button>
            <button
              type="button"
              aria-pressed={formView === "archived"}
              onClick={() => setFormView("archived")}
              className={`min-h-11 flex-1 rounded-md px-3 text-sm font-semibold transition ${
                formView === "archived"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Archived · {archivedFormCount}
            </button>
          </div>
          {visibleForms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
              <p className="font-semibold text-foreground">
                {formView === "archived"
                  ? "No archived forms."
                  : "No registration forms yet."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formView === "archived"
                  ? "Forms you archive will keep their registrant records here."
                  : "Create a form, add its fields and pricing, then publish it."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleForms.map((form) => {
                const counts = formCounts[form.id] ?? { paid: 0, total: 0 };
                const status = formStatusLabel(form);
                const selected = draft.id === form.id;
                const canPublish = form.status !== "open";
                const canStop = form.status === "open";
                const canCopy = form.status !== "draft";
                const canDelete = counts.total === 0;
                const actionTotal =
                  (canPublish ? 1 : 0) +
                  (canStop ? 1 : 0) +
                  (canCopy ? 1 : 0) +
                  1 +
                  (canDelete ? 1 : 0);
                const trailingFull = actionTotal % 2 === 1;
                return (
                  <article
                    key={form.id}
                    className={`min-w-0 rounded-xl border border-l-4 bg-background p-3.5 shadow-sm transition ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : form.archived_at
                          ? "border-l-muted-foreground/30 border-y-border border-r-border"
                          : form.status === "open"
                            ? "border-l-success border-y-border border-r-border"
                            : "border-l-warning border-y-border border-r-border"
                    }`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => void edit(form)}
                        className="min-h-11 min-w-0 flex-1 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <span className="block truncate font-semibold text-foreground">
                          {form.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {counts.paid} paid {counts.paid === 1 ? "registrant" : "registrants"}
                        </span>
                      </button>
                      <span
                        className={`inline-flex shrink-0 items-center gap-x-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                          status === "Live"
                              ? "bg-success/10 text-success"
                            : status === "Archived"
                              ? "bg-muted text-muted-foreground"
                              : "bg-warning/10 text-warning"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${
                            status === "Live"
                              ? "bg-success"
                              : status === "Archived"
                                ? "bg-muted-foreground"
                                : "bg-warning"
                          }`}
                        />
                        {status}
                      </span>
                    </div>
                    {!form.archived_at && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {canPublish && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void runFormAction(form, "publish")}
                            className={`${button} bg-success text-success-foreground hover:bg-success/90`}
                          >
                            <Radio aria-hidden="true" className="size-4" />
                            Publish
                          </button>
                        )}
                        {canStop && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void runFormAction(form, "stop")}
                            className={`${button} border border-warning/40 bg-background text-warning hover:bg-warning/10`}
                          >
                            <Square aria-hidden="true" className="size-4" />
                            Stop registrations
                          </button>
                        )}
                        {canCopy && (
                          <button
                            type="button"
                            onClick={() => void copyLink(form)}
                            className={`${button} border border-border text-foreground hover:bg-accent`}
                          >
                            <Clipboard aria-hidden="true" className="size-4" />
                            Copy link
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void runFormAction(form, "archive")}
                          className={`${button} border border-border text-foreground hover:bg-accent ${!canDelete && trailingFull ? "col-span-2" : ""}`}
                        >
                          <Archive aria-hidden="true" className="size-4" />
                          Archive
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setConfirmDeleteId(form.id)}
                            className={`${button} border border-destructive/25 text-destructive hover:bg-destructive/10 ${trailingFull ? "col-span-2" : ""}`}
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                    {confirmDeleteId === form.id && (
                      <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 p-3">
                        <p className="text-sm text-destructive">
                          Permanently delete this empty form? This cannot be undone.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className={`${button} border border-border text-foreground hover:bg-accent`}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void runFormAction(form, "delete")}
                            className={`${button} bg-destructive text-destructive-foreground hover:bg-destructive/90`}
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
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <AdminPanel className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {draft.id ? "Selected form" : "Creating form"}
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold text-foreground">
                {draft.id ? draft.title || "Untitled form" : "New form"}
              </p>
            </div>
            {draft.id && draft.archivedAt && (
              <span className="inline-flex items-center gap-x-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                <Archive aria-hidden="true" className="size-3.5" />
                Archived
              </span>
            )}
            {draft.id && (
              <AdminTabs
                items={[
                  { id: "build", label: "Form" },
                  { id: "registrants", label: "Registrants", badge: roster.length },
                ]}
                value={formTab}
                onChange={(id) => setFormTab(id as "build" | "registrants")}
                tabsId="registration-form"
                label="Form sections"
                className="ml-auto"
              />
            )}
          </AdminPanel>

          {draft.archivedAt && (
            <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              Archived forms are read-only. Registrant data and CSV export
              remain available below.
            </p>
          )}
          {!draft.archivedAt && draft.status === "open" && (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center">
              <span
                aria-hidden="true"
                className="mt-1.5 hidden size-2 flex-none rounded-full bg-warning sm:block"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-warning">
                  This form is live, so fields and prices are locked
                </p>
                <p className="mt-1 text-sm text-warning/90">
                  Stop registrations to edit the structure. Name and
                  description stay editable.
                </p>
              </div>
              <button
                type="button"
                disabled={saving || !selectedFormRow}
                onClick={() =>
                  selectedFormRow && void runFormAction(selectedFormRow, "stop")
                }
                className={`${button} flex-none border border-warning/40 bg-background text-warning hover:bg-warning/10`}
              >
                <Square aria-hidden="true" className="size-4" />
                Stop registrations
              </button>
            </div>
          )}

          <div
            id={draft.id ? "registration-form-panel-build" : undefined}
            role={draft.id ? "tabpanel" : undefined}
            aria-labelledby={draft.id ? "registration-form-tab-build" : undefined}
            hidden={draft.id ? formTab !== "build" : false}
            className="flex flex-col gap-4"
          >
            <AdminPanel className="overflow-hidden p-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 py-4">
                <h3 className="font-display text-base font-bold uppercase">
                  Basics
                </h3>
                <p className="text-sm text-muted-foreground">
                  Name, description, who it is for
                </p>
              </div>
              <div className="flex flex-col gap-5 p-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Form name
                    <input
                      disabled={saving}
                      className={`${input} mt-1`}
                      value={draft.title}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </label>
                  <div className="block text-sm font-medium">
                    Public link
                    {draft.id && selectedFormRow ? (
                      <div className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-input bg-muted/50 px-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                          {registrationPublicUrl({
                            currentOrigin: window.location.origin,
                            primaryDomain: club.primaryDomain,
                            formSlug: draft.slug,
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => void copyLink(selectedFormRow)}
                          className="flex-none text-xs font-semibold text-primary hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 flex min-h-11 items-center rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground">
                        Available after you save the form.
                      </p>
                    )}
                  </div>
                </div>
                <label className="block text-sm font-medium">
                  Description
                  <textarea
                    disabled={saving}
                    className={`${input} mt-1 min-h-24`}
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </label>
                <fieldset
                  disabled={!canEditStructure || saving}
                  className="rounded-xl border border-border p-4 disabled:opacity-60"
                >
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
                        className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary/70 has-[:checked]:bg-primary/10"
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
                          className="mt-0.5 accent-primary"
                        />
                        <span>
                          <b className="block text-sm">{option.label}</b>
                          <span className="block text-xs text-muted-foreground">
                            {option.hint}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Changing this changes which core fields the public form
                    asks for.
                  </p>
                </fieldset>
              </div>
            </AdminPanel>

            <AdminPanel className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-4">
                <h3 className="font-display text-base font-bold uppercase">
                  Questions
                </h3>
                <p className="text-sm text-muted-foreground">
                  {core.length} core · {draft.custom.length} of your own
                </p>
                <button
                  type="button"
                  disabled={!canEditStructure || saving}
                  className={`${button} ml-auto border border-border hover:bg-accent`}
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
                  + Add question
                </button>
              </div>
              <div className="flex flex-col gap-5 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Required core fields
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {core.map((field) => (
                      <span
                        key={field.field_key}
                        className="inline-flex items-center gap-x-2 rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium text-foreground"
                      >
                        {field.label}
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {field.field_key}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <fieldset
                  disabled={!canEditStructure || saving}
                  className="flex flex-col gap-3 border-t border-border pt-5 disabled:opacity-60"
                >
                  <legend className="mb-1 px-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Your questions
                  </legend>
                  {draft.custom.map((field, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-border p-4"
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
                              className="bg-popover"
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
                          <option value="all" className="bg-popover">
                            Both branches
                          </option>
                          <option value="minor" className="bg-popover">
                            Minors only
                          </option>
                          <option value="adult" className="bg-popover">
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
                        <label className="text-sm text-muted-foreground">
                          <input
                            className="mr-2 accent-primary"
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
                          className="text-sm text-destructive"
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
                </fieldset>
              </div>
            </AdminPanel>

            <AdminPanel className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-4">
                <h3 className="font-display text-base font-bold uppercase">
                  Price options
                </h3>
                <p className="text-sm text-muted-foreground">
                  Enter dollars. Removed options stay inactive for payment
                  history.
                </p>
                <button
                  type="button"
                  disabled={!canEditStructure || saving}
                  className={`${button} ml-auto border border-border hover:bg-accent`}
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
              <fieldset
                disabled={!canEditStructure || saving}
                className="flex flex-col gap-3 p-5 disabled:opacity-60"
              >
                {draft.prices.map((price, index) => (
                  <div
                    className="grid min-w-0 gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto] sm:items-center sm:border-0 sm:p-0"
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
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-muted-foreground">
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
                    <label className="flex min-h-11 items-center text-sm text-muted-foreground">
                      <input
                        className="mr-2 accent-primary"
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
                      className={`${button} px-2 text-destructive hover:bg-destructive/10`}
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
              </fieldset>
            </AdminPanel>

            <AdminPanel className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-4">
                <h3 className="font-display text-base font-bold uppercase">
                  Waiver and consent
                </h3>
                <p className="text-sm text-muted-foreground">
                  Seeded from the standard template with your club name
                </p>
                <button
                  type="button"
                  onClick={() => setWaiverExpanded((value) => !value)}
                  aria-expanded={waiverExpanded}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  {waiverExpanded ? "Collapse" : "Expand"}
                  {waiverExpanded ? (
                    <ChevronUp aria-hidden="true" className="size-3.5" />
                  ) : (
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  )}
                </button>
              </div>
              {waiverExpanded && (
                <div className="p-5">
                  <textarea
                    disabled={saving}
                    aria-describedby="registration-waiver-guidance"
                    className={`${input} min-h-64`}
                    value={draft.waiver}
                    onChange={(event) =>
                      setDraft({ ...draft, waiver: event.target.value })
                    }
                  />
                  <p
                    id="registration-waiver-guidance"
                    className="mt-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2.5 text-sm leading-relaxed text-warning"
                  >
                    {REGISTRATION_WAIVER_LEGAL_HINT}
                  </p>
                </div>
              )}
            </AdminPanel>

            <AdminPanel className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              {!canEditStructure && !draft.archivedAt && (
                <p className="text-sm text-muted-foreground">
                  Structure changes are disabled while the form is live.
                </p>
              )}
              <button
                disabled={saving || !canEditStructure}
                onClick={saveDraft}
                className={`${button} ml-auto bg-primary text-primary-foreground hover:bg-primary/90`}
              >
                {saving ? "Saving…" : "Save form"}
              </button>
            </AdminPanel>
            </div>
        {draft.id && (
          <div
            id="registration-form-panel-registrants"
            role="tabpanel"
            aria-labelledby="registration-form-tab-registrants"
            hidden={formTab !== "registrants"}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Paid
                </p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
                  {paidCount}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Collected
                </p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
                  {formatRegistrationUsd(collectedCents)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Refunded
                </p>
                <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
                  {refundedCount}
                </p>
              </div>
              <div
                className={`rounded-xl border p-4 ${
                  recoveryCount > 0
                    ? "border-destructive/30 bg-destructive/10"
                    : "border-border bg-card"
                }`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                    recoveryCount > 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  Needs review
                </p>
                <p
                  className={`mt-1.5 text-2xl font-bold tabular-nums ${
                    recoveryCount > 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {recoveryCount}
                </p>
              </div>
            </div>

            <AdminPanel className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
                <div className="relative w-full sm:w-64">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="search"
                    value={rosterQuery}
                    onChange={(event) => setRosterQuery(event.target.value)}
                    placeholder="Search name or email"
                    aria-label="Search registrants by name or email"
                    className={`${input} pl-9`}
                  />
                </div>
                {(
                  [
                    { id: "all", label: "All", count: roster.length },
                    { id: "paid", label: "Paid", count: paidCount },
                    { id: "refunded", label: "Refunded", count: refundedCount },
                    { id: "review", label: "Review", count: recoveryCount },
                  ] as const
                ).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={rosterFilter === filter.id}
                    onClick={() => setRosterFilter(filter.id)}
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition ${
                      rosterFilter === filter.id
                        ? filter.id === "review"
                          ? "border-destructive bg-destructive text-destructive-foreground"
                          : "border-foreground bg-foreground text-background"
                        : filter.id === "review"
                          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
                          : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {filter.label} {filter.count}
                  </button>
                ))}
                <a
                  className={`${button} ml-auto w-full border border-border hover:bg-accent sm:w-auto`}
                  href={`/api/admin/registrations/export?formId=${draft.id}`}
                >
                  Export CSV
                </a>
              </div>

              {roster.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No paid registrations yet.
                </p>
              ) : visibleRoster.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No registrants match this filter.
                </p>
              ) : (
              <>
                <div className="px-4 pb-4">
                <div className="mt-5 space-y-3 md:hidden">
                  {visibleRoster.map((entry) => {
                    const recovery = entry.payment_recovery_required;
                    return (
                      <details
                        key={entry.id}
                        className="group min-w-0 rounded-xl border border-border bg-background open:border-primary/30"
                      >
                        <summary className="flex min-h-14 cursor-pointer list-none items-start justify-between gap-3 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-foreground">
                              {registrationName(entry)}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {formatRegistrationUsd(entry.amount_cents)} · {new Date(
                                entry.submitted_at,
                              ).toLocaleDateString()}
                            </span>
                          </span>
                          <span
                            className={`inline-flex shrink-0 items-center gap-x-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                              recovery
                                ? "bg-destructive/10 text-destructive"
                                : entry.status === "paid"
                                  ? "bg-success/10 text-success"
                                  : "bg-warning/10 text-warning"
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
                        <div className="border-t border-border px-4 py-4">
                          {recovery && (
                            <p className="mb-4 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                              Payment completion needs manual review before this
                              record is treated as confirmed.
                            </p>
                          )}
                          <dl className="space-y-3">
                            {answerRows(entry).map((answer) => (
                              <div key={answer.key} className="min-w-0">
                                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                  {answer.label}
                                </dt>
                                <dd className="mt-1 break-words text-sm text-foreground">
                                  {answer.isSignature
                                    ? "Signature captured"
                                    : answerText(answer.value)}
                                </dd>
                              </div>
                            ))}
                            <div>
                              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                Email
                              </dt>
                              <dd className="mt-1 break-all text-sm text-foreground">
                                {entry.registrant_email}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                Price paid
                              </dt>
                              <dd className="mt-1 text-sm text-foreground">
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
                </div>

                <div className="px-4 pb-4">
                <div className="mt-5 hidden md:block">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="w-[26%] px-3 py-3">Registrant</th>
                        <th className="w-[24%] px-3 py-3">Email</th>
                        <th className="w-[16%] px-3 py-3">Price</th>
                        <th className="w-[14%] px-3 py-3 text-right">Amount</th>
                        <th className="w-[20%] px-3 py-3">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRoster.map((entry) => (
                        <tr
                          key={entry.id}
                          className={`border-b border-border ${entry.payment_recovery_required ? "bg-destructive/5" : ""}`}
                        >
                          <td className="px-3 py-3 align-top">
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={`inline-flex flex-none items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  entry.payment_recovery_required
                                    ? "bg-destructive/10 text-destructive"
                                    : entry.status === "paid"
                                      ? "bg-success/10 text-success"
                                      : "bg-warning/10 text-warning"
                                }`}
                              >
                                {entry.payment_recovery_required
                                  ? "Review"
                                  : entry.status === "paid"
                                    ? "Paid"
                                    : "Refunded"}
                              </span>
                              <span className="truncate font-medium">
                                {registrationName(entry)}
                              </span>
                            </span>
                          </td>
                          <td className="truncate px-3 py-3 align-top text-muted-foreground">
                            {entry.registrant_email}
                          </td>
                          <td className="truncate px-3 py-3 align-top text-muted-foreground">
                            {entry.price_label}
                          </td>
                          <td className="px-3 py-3 align-top text-right font-medium tabular-nums">
                            {formatRegistrationUsd(entry.amount_cents)}
                          </td>
                          <td className="px-3 py-3 align-top text-muted-foreground">
                            {new Date(entry.submitted_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </>
            )}
            </AdminPanel>
            <p className="text-xs text-muted-foreground">
              Paid and refunded registrations only. Pending and expired
              attempts stay out.
            </p>
          </div>
        )}
      </div>
    </div>
    </AdminPage>
  );
}
