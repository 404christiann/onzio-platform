"use client";
import { useClubContext } from "@/components/ClubContextProvider";
import { createClient } from "@/lib/admin-client";
import { formatRegistrationUsdInput,parseRegistrationUsdInput } from "@/lib/registration-currency";
import { buildCoreRegistrationFields,isRegistrationSignatureValue } from "@/lib/registration-fields";
import { planRegistrationPricePositionSync } from "@/lib/registration-price-sync";
import { registrationPublicUrl } from "@/lib/registration-public-link";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { blank,registrationFieldInsertRows,registrationName,type Draft,type Field,type FormCounts,type FormRow,type Registration,type StoredPrice } from "./registration-editor-model";

export function useRegistrationsEditor({ classic = false }: { classic?: boolean } = {}) {
  const club = useClubContext();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [formCounts, setFormCounts] = useState<FormCounts>({});
  const [formView, setFormView] = useState<"active" | "archived">("active");
  const [formTab, setFormTab] = useState<"build" | "registrants">(classic ? "registrants" : "build");
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Draft>(() => blank(club.name));
  const [opening, setOpening] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const selectedOnce = useRef(false);
  const loadVersion = useRef(0);
  const writing = useRef(false);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  function startNew() {
    if (classic && opening) return;
    ++loadVersion.current;
    const next = blank(club.name);
    setDraft(next);
    setBaseline(next);
    setRoster([]);
    setOriginalPriceIds([]);
    setFormTab("build");
    setMessage(null);
    setNeedsReview(false);
  }
  function discardDraft() {
    if (needsReview) throw new Error("Reload and review the saved form before leaving.");
    setDraft(baseline);
  }

  const core = useMemo<Field[]>(
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
    // Reads every registration row page by page with a stable ordering —
    // the same pagination contract as readAllPaidRegistrations in
    // lib/admin-dashboard-data.ts (which can't be reused directly here: it
    // is paid-only and takes a server-side onzio-schema client, while this
    // page needs paid AND total counts through the RLS-scoped admin
    // client). A single unpaginated select silently truncates at Supabase's
    // default 1000-row cap and undercounts; .range() without .order() has
    // no stable row order across pages and can skip/double-count.
    const readAllRegistrationRows = async () => {
      const pageSize = 500;
      const rows: Array<{ form_id: string; status: Registration["status"] }> = [];
      for (let start = 0; ; start += pageSize) {
        const { data, error } = await client
          .from("registrations")
          .select("form_id,status")
          .order("id", { ascending: true })
          .range(start, start + pageSize - 1);
        if (error) throw new Error(error.message);
        const page = (data ?? []) as Array<{
          form_id: string;
          status: Registration["status"];
        }>;
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    };
    const [formsResult, registrationRows] = await Promise.all([
      client
        .from("registration_forms")
        .select("*")
        .order("created_at", { ascending: false }),
      readAllRegistrationRows(),
    ]);
    if (formsResult.error) {
      throw new Error(
        formsResult.error?.message ?? "Could not load registrations.",
      );
    }
    const nextCounts: FormCounts = {};
    for (const row of registrationRows) {
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
    // A failed account request must not reveal forms whose data is still pending.
    Promise.allSettled([
      refresh(),
      fetch("/api/stripe/connect?action=status", {
        credentials: "same-origin",
      }).then(async (response) => {
        if (!response.ok)
          throw new Error("Could not load Stripe Connect status.");
        setConnect(await response.json());
      }),
    ])
      .then((results) => {
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") {
          const error: unknown = failure.reason;
          const text = error instanceof Error ? error.message : "Could not load registrations.";
          if (classic) setLoadError(text);
          else setMessage(text);
        }
        setLoading(false);
      });
  }, [refresh, classic]);
  const edit = useCallback(async (form: FormRow, tab: "build" | "registrants" = classic ? "registrants" : "build", quiet = false): Promise<boolean> => {
    const version = ++loadVersion.current;
    if (classic && !quiet) setOpening(true);
    setMessage(null);
    setFormTab(tab);
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
    if (classic && version !== loadVersion.current) return false;
    if (classic && !quiet) setOpening(false);
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
    const loadedDraft: Draft = {
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
    };
    setDraft(loadedDraft);
    setBaseline(loadedDraft);
    setNeedsReview(false);
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
  }, [classic]);
  useEffect(() => {
    if (!classic || loading || selectedOnce.current) return;
    selectedOnce.current = true;
    const first = forms.find((form) => !form.archived_at);
    if (first) void edit(first);
  }, [classic, loading, forms, edit]);
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
    if (classic && (opening || writing.current || needsReview)) return;
    if (classic) writing.current = true;
    let definitelyRejected = false;
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
        definitelyRejected = Boolean(result.error?.code);
        throw new Error(actionErrorMessage(result.error?.code ?? ""));
      }

      const archivedAt = action === "archive" ? new Date().toISOString() : null;
      if (classic && draft.id === form.id) {
        if (action === "delete") setBaseline(blank(club.name));
        else setBaseline((current) => ({
          ...current,
          status: action === "publish" ? "open" : action === "stop" || (action === "archive" && current.status === "open") ? "closed" : current.status,
          archivedAt: action === "archive" ? archivedAt : current.archivedAt,
        }));
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
            archivedAt,
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
      if (classic && !definitelyRejected) setNeedsReview(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update this registration form.",
      );
    } finally {
      if (classic) writing.current = false;
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

  async function saveDraft(): Promise<boolean> {
    if (classic && (opening || writing.current || needsReview)) return false;
    writing.current = true;
    let mutationAttempted = false;
    let mutationConfirmed = false;
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
        mutationAttempted = true;
        const result = await client
          .from("registration_forms")
          .update(formPayload)
          .eq("id", id)
          .select("id")
          .single();
        if (result.error) {
          if (/^(?:23|28|40|42)[0-9A-Z]{3}$/.test(result.error.code) || ["INVALID_ADMIN_PAYLOAD", "INVALID_ADMIN_FILTER", "AUTHENTICATION_REQUIRED", "NOT_AUTHORIZED", "FORBIDDEN"].includes(result.error.code)) mutationAttempted = false;
          throw new Error(result.error.message);
        }
        mutationConfirmed = true;
      } else {
        mutationAttempted = true;
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
          if (response.status >= 400 && response.status < 500 && result.error?.code && result.error.code !== "REGISTRATION_ADMIN_FAILED") mutationAttempted = false;
          throw new Error(actionErrorMessage(result.error?.code ?? ""));
        }
        id = result.form.id;
        mutationConfirmed = true;
        if (classic) setDraft((current) => ({ ...current, id }));

      }
      if (!id) throw new Error("Could not resolve the registration form.");
      mutationAttempted = true;
      const deleteFields = await client
        .from("registration_form_fields")
        .delete()
        .eq("form_id", id);
      if (deleteFields.error) throw new Error(deleteFields.error.message);
      const nextFields = registrationFieldInsertRows(id, core, draft.custom);
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
      if (!(await edit(savedForm, "build", true))) {
        throw new Error("Could not load the saved form.");
      }
      setMessage("Form saved.");
      return true;
    } catch (error: unknown) {
      if (classic && (mutationAttempted || mutationConfirmed)) setNeedsReview(true);
      setMessage(
        error instanceof Error ? error.message : "Could not save this form.",
      );
      return false;
    } finally {
      writing.current = false;
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

 return { loadError, baseline, isDirty, opening, needsReview, startNew, discardDraft, club, forms, setForms, formCounts, formView, setFormView, formTab, setFormTab, rosterFilter, setRosterFilter, rosterQuery, setRosterQuery, waiverExpanded, setWaiverExpanded, confirmDeleteId, setConfirmDeleteId, draft, setDraft, roster, setRoster, originalPriceIds, setOriginalPriceIds, connect, loading, saving, message, setMessage, core, canEditStructure, refresh, edit, runFormAction, copyLink, saveDraft, visibleForms, activeFormCount, archivedFormCount, answerRows, selectedFormRow, recoveryCount, paidCount, refundedCount, collectedCents, visibleRoster };
}
export type RegistrationsEditorModel = ReturnType<typeof useRegistrationsEditor>;
