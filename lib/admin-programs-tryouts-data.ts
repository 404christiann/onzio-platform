import { tallySignUps } from "@/lib/admin-sign-ups-data";
import type { Onzio } from "@/lib/admin-home-data";
import { formatClubDate } from "@/lib/club-time";
import { normalizePublicHref } from "@/lib/public-link";
import {
  compareTryoutsByDate,
  formPriceText,
  programSignUp,
  tryoutSignUp,
  type SignUpState,
  type SignUpWay,
} from "@/lib/sign-up-state";

// ADMIN-RE-12c: the data behind "Programs and tryouts" (design:
// cd-programs-final, cd-tryout-final). Reads go through the signed-in person's
// own client, so RLS is the boundary, and every query is also scoped to the
// club. Only form titles, prices and counts are read for sign-ups: no names or
// contact details. The state of each row comes from lib/sign-up-state.ts, the
// same rule the public site and the database use.

export type SignUpFormOption = Readonly<{
  id: string;
  title: string;
  /** "$25", "From $25", "Free"; null when the form has no active price. */
  price: string | null;
  /** Draft or closed on the Sign-up forms page: families can't use it until it's open. */
  open: boolean;
  /** Takes payment and the club hasn't connected payments yet. */
  needsPayments: boolean;
  /** The program or tryout already using it (decision 12), if any. */
  usedBy: Readonly<{ kind: "program" | "tryout"; id: string; name: string }> | null;
}>;

type ItemBase = Readonly<{
  id: string;
  name: string;
  state: SignUpState;
  way: SignUpWay;
  /** The form's price while it is the sign-up way; otherwise null. */
  price: string | null;
  /** Paid and refunded sign-ups on the linked form; null without a form. */
  signedUp: number | null;
  formId: string | null;
  /** The linked form is draft or closed, so it isn't a sign-up way yet. */
  formNotOpen: boolean;
  linkLabel: string;
  linkHref: string;
  byContact: boolean;
  /** The row's last save, sent back so a stale tab can't overwrite a newer change. */
  updatedAt: string;
}>;

export type TryoutItem = ItemBase &
  Readonly<{
    kind: "tryout";
    eventDate: string | null;
    location: string;
    costNote: string;
    /** "Sat, Mar 7 · Riverside Fields", or "" with neither. */
    line: string;
    /** "Closed after Sat, Mar 7" when the date closed it; Reopen undoes that. */
    closedLine: string | null;
    closedByOwner: boolean;
    hidden: boolean;
    staysOpenAfterDate: boolean;
  }>;

export type ProgramItem = ItemBase &
  Readonly<{
    kind: "program";
    /** The program's summary, the line under its name. */
    line: string;
    closedByOwner: boolean;
    hidden: boolean;
    sortOrder: number;
  }>;

export type ProgramsTryoutsData =
  | Readonly<{
      status: "ready";
      tryouts: readonly TryoutItem[];
      programs: readonly ProgramItem[];
      forms: readonly SignUpFormOption[];
      /** Whether the club's public site has the contact email "They contact you" needs. */
      hasContactEmail: boolean;
    }>
  | Readonly<{ status: "error" }>;

type TryoutRecord = {
  id: string;
  headline: string;
  status: string;
  event_date: string | null;
  location: string;
  cost_text: string;
  cta_label: string;
  registration_href: string;
  registration_form_id: string | null;
  sort_order: number;
  hidden: boolean;
  sign_up_by_contact: boolean;
  stays_open_after_date: boolean;
  updated_at: string;
};

type ProgramRecord = {
  id: string;
  display_title: string;
  summary: string;
  status: string;
  external_cta_label: string;
  external_cta_href: string;
  registration_form_id: string | null;
  sign_ups_closed: boolean;
  sign_up_by_contact: boolean;
  sort_order: number;
  updated_at: string;
};

type FormRecord = { id: string; title: string; status: string; archived_at: string | null };
type PriceRecord = { form_id: string; amount_cents: number };

const TRYOUT_COLUMNS =
  "id,headline,status,event_date,location,cost_text,cta_label,registration_href,registration_form_id,sort_order,hidden,sign_up_by_contact,stays_open_after_date,updated_at";
const PROGRAM_COLUMNS =
  "id,display_title,summary,status,external_cta_label,external_cta_href,registration_form_id,sign_ups_closed,sign_up_by_contact,sort_order,updated_at";

/** "Sat, Mar 7" for a stored date, the same form the list and the note use. */
export function tryoutDay(date: string | null): string | null {
  return date ? formatClubDate(date, "weekday-short") : null;
}

function hasLink(label: string, href: string): boolean {
  return Boolean(label.trim() && normalizePublicHref(href));
}

export type ProgramsTryoutsSections = Readonly<{ programs: boolean; tryouts: boolean }>;

export async function loadProgramsTryouts(
  onzio: Onzio,
  clubId: string,
  today: string,
  sections: ProgramsTryoutsSections,
  ledgerEnvironment: "test" | "production",
): Promise<ProgramsTryoutsData> {
  try {
    const empty = Promise.resolve({ data: [], error: null });
    const [tryoutsResult, programsResult, formsResult, pricesResult, connectResult, contactResult, tally] =
      await Promise.all([
        sections.tryouts
          ? onzio.from("tryouts").select(TRYOUT_COLUMNS).eq("club_id", clubId).order("sort_order", { ascending: true })
          : empty,
        // Programs are read even without a Programs page, so a form a program
        // uses still says so in the picker.
        onzio.from("programs").select(PROGRAM_COLUMNS).eq("club_id", clubId).order("sort_order", { ascending: true }),
        onzio
          .from("registration_forms")
          .select("id,title,status,archived_at")
          .eq("club_id", clubId)
          .order("created_at", { ascending: false }),
        onzio
          .from("registration_price_options")
          .select("form_id,amount_cents")
          .eq("club_id", clubId)
          .eq("active", true),
        onzio
          .from("club_stripe_connect")
          .select("environment,charges_enabled")
          .eq("club_id", clubId),
        onzio.from("contact_profile").select("public_email").eq("club_id", clubId).limit(1),
        tallySignUps(onzio, clubId),
      ]);
    for (const result of [tryoutsResult, programsResult, formsResult, pricesResult, contactResult]) {
      if (result.error) throw result.error;
    }

    const forms = (formsResult.data ?? []) as FormRecord[];
    const formById = new Map(forms.map((form) => [form.id, form]));
    const amounts = new Map<string, number[]>();
    for (const price of (pricesResult.data ?? []) as PriceRecord[]) {
      amounts.set(price.form_id, [...(amounts.get(price.form_id) ?? []), price.amount_cents]);
    }
    // An unreadable Connect record never dims a form: the server checks again at sign-up.
    const connect = connectResult.error ? null : ((connectResult.data ?? []) as Array<{ environment: string; charges_enabled: boolean }>);
    const paymentsReady = connect === null || connect.some((row) => row.environment === ledgerEnvironment && row.charges_enabled);
    const priceOf = (formId: string | null) => (formId ? formPriceText(amounts.get(formId) ?? []) : null);
    const isOpen = (formId: string | null) => Boolean(formId && formById.get(formId)?.status === "open");

    const tryoutRows = (tryoutsResult.data ?? []) as TryoutRecord[];
    const programRows = (programsResult.data ?? []) as ProgramRecord[];

    const tryouts = tryoutRows
      .map<TryoutItem>((row) => {
        const open = isOpen(row.registration_form_id);
        const signUp = tryoutSignUp(
          {
            hidden: row.hidden,
            status: row.status,
            eventDate: row.event_date,
            staysOpenAfterDate: row.stays_open_after_date,
            hasOpenForm: open,
            hasLink: hasLink(row.cta_label, row.registration_href),
            byContact: row.sign_up_by_contact,
          },
          today,
        );
        const day = tryoutDay(row.event_date);
        return {
          kind: "tryout",
          id: row.id,
          name: row.headline || "Tryout",
          state: signUp.state,
          way: signUp.way,
          price: signUp.way === "form" ? priceOf(row.registration_form_id) : null,
          signedUp: row.registration_form_id ? (tally.perForm.get(row.registration_form_id) ?? 0) : null,
          formId: row.registration_form_id,
          formNotOpen: Boolean(row.registration_form_id) && !open,
          linkLabel: row.cta_label,
          linkHref: row.registration_href,
          byContact: row.sign_up_by_contact,
          updatedAt: row.updated_at,
          eventDate: row.event_date,
          location: row.location,
          costNote: row.cost_text,
          line: [day, row.location.trim()].filter(Boolean).join(" · "),
          closedLine: signUp.closedByDate && day ? `Closed after ${day}` : null,
          closedByOwner: row.status === "closed",
          hidden: row.hidden,
          staysOpenAfterDate: row.stays_open_after_date,
        };
      })
      .sort((a, b) =>
        compareTryoutsByDate(
          { eventDate: a.eventDate, sortOrder: tryoutRows.find((row) => row.id === a.id)?.sort_order ?? 0 },
          { eventDate: b.eventDate, sortOrder: tryoutRows.find((row) => row.id === b.id)?.sort_order ?? 0 },
        ),
      );

    const programs = programRows.map<ProgramItem>((row) => {
      const open = isOpen(row.registration_form_id);
      const signUp = programSignUp({
        status: row.status,
        signUpsClosed: row.sign_ups_closed,
        hasOpenForm: open,
        hasLink: hasLink(row.external_cta_label, row.external_cta_href),
        byContact: row.sign_up_by_contact,
      });
      return {
        kind: "program",
        id: row.id,
        name: row.display_title,
        state: signUp.state,
        way: signUp.way,
        price: signUp.way === "form" ? priceOf(row.registration_form_id) : null,
        signedUp: row.registration_form_id ? (tally.perForm.get(row.registration_form_id) ?? 0) : null,
        formId: row.registration_form_id,
        formNotOpen: Boolean(row.registration_form_id) && !open,
        linkLabel: row.external_cta_label,
        linkHref: row.external_cta_href,
        byContact: row.sign_up_by_contact,
        updatedAt: row.updated_at,
        line: row.summary,
        closedByOwner: row.sign_ups_closed,
        hidden: row.status === "hidden",
        sortOrder: row.sort_order,
      };
    });

    const users = new Map<string, SignUpFormOption["usedBy"]>();
    for (const row of programRows) {
      if (row.registration_form_id) users.set(row.registration_form_id, { kind: "program", id: row.id, name: row.display_title });
    }
    for (const row of tryoutRows) {
      if (row.registration_form_id && !users.has(row.registration_form_id)) {
        users.set(row.registration_form_id, { kind: "tryout", id: row.id, name: row.headline || "Tryout" });
      }
    }
    const formOptions = forms
      .filter((form) => form.archived_at === null)
      .map<SignUpFormOption>((form) => {
        const formAmounts = amounts.get(form.id) ?? [];
        return {
          id: form.id,
          title: form.title,
          price: formPriceText(formAmounts),
          open: form.status === "open",
          needsPayments: !paymentsReady && formAmounts.some((amount) => amount > 0),
          usedBy: users.get(form.id) ?? null,
        };
      });

    const email = ((contactResult.data ?? []) as Array<{ public_email: string | null }>)[0]?.public_email ?? "";
    return {
      status: "ready",
      tryouts: sections.tryouts ? tryouts : [],
      programs: sections.programs ? programs : [],
      forms: formOptions,
      hasContactEmail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()),
    };
  } catch {
    return { status: "error" };
  }
}
