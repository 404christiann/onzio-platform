import type { SupabaseClient } from "@supabase/supabase-js";
import { countNewSignUps, newSignUpsSince, type Onzio } from "@/lib/admin-home-data";
import { clubToday, formatClubDate } from "@/lib/club-time";

// ADMIN-RE-08: the data behind "See registrations" (/admin/sign-ups). Reads go
// through the signed-in person's own client, so RLS (registrations_member_read)
// is the boundary, and every query is also scoped to the club. The list selects
// only the two name keys from `answers`; contact details are read for the one
// person whose details are open, never for the whole list. The status token is
// never selected, and nothing here is logged.

export const SIGN_UP_TABS = ["all", "paid", "refunded"] as const;
export type SignUpTab = (typeof SIGN_UP_TABS)[number];
export type SignUpStatus = "paid" | "refunded";

/** How many people the list shows; the rest are in "Download list". */
export const SIGN_UP_LIST_LIMIT = 100;
const COUNT_PAGE_SIZE = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SignUpForm = { id: string; title: string; archived: boolean; signUps: number };
export type SignUpCounts = Record<SignUpTab, number>;

export type SignUpRow = {
  id: string;
  name: string;
  formTitle: string;
  status: SignUpStatus;
  amountCents: number;
  /** "Today", "Yesterday", "3 days ago", "Nov 1", in club time. */
  when: string;
};

export type SignUpDetail = SignUpRow & {
  /** A child's sign-up shows the parent or guardian; an adult's shows their own details. */
  contactLabel: "Parent or guardian" | "Contact";
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  refundedCents: number;
  /** "Nov 1": the day the payment went through, in club time. */
  paidOn: string;
  refundedOn: string | null;
};

export type SignUpsData =
  | {
      status: "ready";
      /** Null when it could not be read: the heading falls back rather than guess. */
      newThisWeek: number | null;
      counts: SignUpCounts;
      /** Every form with at least one paid or refunded sign-up, newest form first. */
      forms: SignUpForm[];
      tab: SignUpTab;
      rows: SignUpRow[];
      /** The open person's details; null when none is open or they could not be found. */
      detail: SignUpDetail | null;
    }
  | { status: "error" };

export function parseSignUpTab(value: unknown): SignUpTab {
  return SIGN_UP_TABS.includes(value as SignUpTab) ? (value as SignUpTab) : "all";
}

export function parseSignUpPersonId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

const LIST_COLUMNS =
  "id,form_id,status,participant_type,amount_cents,submitted_at,player_name:answers->>player_name,registrant_name:answers->>registrant_name";

const DETAIL_COLUMNS = [
  "id,form_id,status,participant_type,registrant_email,amount_cents,amount_refunded_cents,submitted_at,paid_at,refunded_at",
  "player_name:answers->>player_name",
  "registrant_name:answers->>registrant_name",
  "guardian_name:answers->>guardian_name",
  "guardian_phone:answers->>guardian_phone",
  "guardian_email:answers->>guardian_email",
  "registrant_phone:answers->>registrant_phone",
  "registrant_email_answer:answers->>registrant_email",
].join(",");

type ListRecord = {
  id: string;
  form_id: string;
  status: SignUpStatus;
  participant_type: "minor" | "adult";
  amount_cents: number;
  submitted_at: string;
  player_name: string | null;
  registrant_name: string | null;
};

type DetailRecord = ListRecord & {
  registrant_email: string | null;
  amount_refunded_cents: number;
  paid_at: string | null;
  refunded_at: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_email: string | null;
  registrant_phone: string | null;
  registrant_email_answer: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The person signed up: the player for a child's form, the registrant for an adult's. */
export function signUpPersonName(record: {
  participant_type: string;
  player_name: string | null;
  registrant_name: string | null;
}): string {
  const first = record.participant_type === "adult" ? record.registrant_name : record.player_name;
  const second = record.participant_type === "adult" ? record.player_name : record.registrant_name;
  return text(first) ?? text(second) ?? "Name not given";
}

function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** A moment as the club's own calendar day: "Nov 1", or "Nov 1, 2025" from another year. */
export function clubDayLabel(instant: string, timeZone: string, now: Date = new Date()): string {
  const day = clubToday(timeZone, new Date(instant));
  const sameYear = day.slice(0, 4) === clubToday(timeZone, now).slice(0, 4);
  return formatClubDate(day, sameYear ? "short" : "long") ?? day;
}

/** "Today", "Yesterday", "3 days ago" within the week, otherwise the day ("Nov 1"). */
export function relativeSignUpDay(instant: string, timeZone: string, now: Date = new Date()): string {
  const days = daysBetween(clubToday(timeZone, new Date(instant)), clubToday(timeZone, now));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return clubDayLabel(instant, timeZone, now);
}

type FormRecord = { id: string; title: string; archived_at: string | null; created_at: string };

async function tallySignUps(
  onzio: Onzio,
  clubId: string,
): Promise<{ counts: SignUpCounts; perForm: Map<string, number> }> {
  const counts: SignUpCounts = { all: 0, paid: 0, refunded: 0 };
  const perForm = new Map<string, number>();
  for (let start = 0; ; start += COUNT_PAGE_SIZE) {
    // Stable ordering keeps successive .range() windows from skipping or
    // double-counting rows (the same rule as readAllPaidRegistrations).
    const { data, error } = await onzio
      .from("registrations")
      .select("form_id,status")
      .eq("club_id", clubId)
      .in("status", ["paid", "refunded"])
      .order("id", { ascending: true })
      .range(start, start + COUNT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<{ form_id: string; status: SignUpStatus }>;
    for (const row of page) {
      counts.all += 1;
      counts[row.status] += 1;
      perForm.set(row.form_id, (perForm.get(row.form_id) ?? 0) + 1);
    }
    if (page.length < COUNT_PAGE_SIZE) return { counts, perForm };
  }
}

function toRow(
  record: ListRecord,
  formTitles: ReadonlyMap<string, string>,
  timeZone: string,
  now: Date,
): SignUpRow {
  return {
    id: record.id,
    name: signUpPersonName(record),
    formTitle: formTitles.get(record.form_id) ?? "Sign-up form",
    status: record.status,
    amountCents: record.amount_cents,
    when: relativeSignUpDay(record.submitted_at, timeZone, now),
  };
}

async function readDetail(
  onzio: Onzio,
  clubId: string,
  personId: string,
  formTitles: ReadonlyMap<string, string>,
  timeZone: string,
  now: Date,
): Promise<SignUpDetail | null> {
  const { data, error } = await onzio
    .from("registrations")
    .select(DETAIL_COLUMNS)
    .eq("club_id", clubId)
    .eq("id", personId)
    .in("status", ["paid", "refunded"])
    .maybeSingle();
  if (error || !data) return null;
  const record = data as unknown as DetailRecord;
  const adult = record.participant_type === "adult";
  return {
    ...toRow(record, formTitles, timeZone, now),
    contactLabel: adult ? "Contact" : "Parent or guardian",
    contactName: text(adult ? record.registrant_name : record.guardian_name),
    contactPhone: text(adult ? record.registrant_phone : record.guardian_phone),
    contactEmail: adult
      ? text(record.registrant_email_answer) ?? text(record.registrant_email)
      : text(record.guardian_email),
    refundedCents: record.amount_refunded_cents ?? 0,
    paidOn: clubDayLabel(record.paid_at ?? record.submitted_at, timeZone, now),
    refundedOn: record.refunded_at ? clubDayLabel(record.refunded_at, timeZone, now) : null,
  };
}

export async function loadSignUps(
  supabase: SupabaseClient,
  clubId: string,
  timeZone: string,
  options: { tab?: SignUpTab; personId?: string | null; now?: Date } = {},
): Promise<SignUpsData> {
  const onzio = supabase.schema("onzio");
  const tab = options.tab ?? "all";
  const now = options.now ?? new Date();
  try {
    const formsResult = await onzio
      .from("registration_forms")
      .select("id,title,archived_at,created_at")
      .eq("club_id", clubId)
      .order("created_at", { ascending: false });
    if (formsResult.error) return { status: "error" };
    const formRecords = (formsResult.data ?? []) as FormRecord[];
    const formTitles = new Map(formRecords.map((form) => [form.id, form.title]));
    const currentFormIds = new Set(formRecords.filter((form) => !form.archived_at).map((form) => form.id));

    const list = onzio
      .from("registrations")
      .select(LIST_COLUMNS)
      .eq("club_id", clubId)
      .in("status", tab === "all" ? ["paid", "refunded"] : [tab])
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(SIGN_UP_LIST_LIMIT);

    const [tally, listResult, newThisWeek, detail] = await Promise.all([
      tallySignUps(onzio, clubId),
      list,
      currentFormIds.size
        ? countNewSignUps(onzio, clubId, currentFormIds, newSignUpsSince(timeZone, now)).catch(() => null)
        : Promise.resolve(0),
      options.personId
        ? readDetail(onzio, clubId, options.personId, formTitles, timeZone, now)
        : Promise.resolve(null),
    ]);
    if (listResult.error) return { status: "error" };

    return {
      status: "ready",
      newThisWeek,
      counts: tally.counts,
      forms: formRecords.flatMap((form) => {
        const signUps = tally.perForm.get(form.id) ?? 0;
        return signUps ? [{ id: form.id, title: form.title, archived: Boolean(form.archived_at), signUps }] : [];
      }),
      tab,
      rows: ((listResult.data ?? []) as unknown as ListRecord[]).map((record) =>
        toRow(record, formTitles, timeZone, now),
      ),
      detail,
    };
  } catch {
    return { status: "error" };
  }
}
