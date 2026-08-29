import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRegistrationMix,
  type RegistrationMixItem,
} from "@/lib/admin-dashboard-mix";

export type DashboardForm = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

export type DashboardEvent = {
  id: string;
  kind: "fixture" | "tryout";
  date: string;
  time: string | null;
  title: string;
  detail: string;
};

export type DashboardSection<T> =
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

export type AdminDashboardData = {
  activeSeasonLabel: string | null;
  players: DashboardSection<number>;
  staff: DashboardSection<number>;
  seasonMatches: DashboardSection<number>;
  paidRegistrations: DashboardSection<number>;
  forms: DashboardSection<DashboardForm[]>;
  events: DashboardSection<DashboardEvent[]>;
  registrationMix: DashboardSection<RegistrationMixItem[]>;
};

type PaidRegistration = { formId: string };

async function readAllPaidRegistrations(
  onzio: ReturnType<SupabaseClient["schema"]>,
  clubId: string,
): Promise<PaidRegistration[]> {
  const pageSize = 500;
  const rows: PaidRegistration[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await onzio
      .from("registrations")
      .select("form_id")
      .eq("club_id", clubId)
      .eq("status", "paid")
      .range(start, start + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<{ form_id: string }>;
    rows.push(...page.map((row) => ({ formId: row.form_id })));
    if (page.length < pageSize) return rows;
  }
}

function ready<T>(data: T): DashboardSection<T> {
  return { status: "ready", data };
}

function failed<T>(message: string): DashboardSection<T> {
  return { status: "error", message };
}

export async function loadAdminDashboardData(
  supabase: SupabaseClient,
  clubId: string,
): Promise<AdminDashboardData> {
  const onzio = supabase.schema("onzio");
  const today = new Date().toISOString().slice(0, 10);

  const activeSeasonPromise = onzio
    .from("seasons")
    .select("id,label")
    .eq("club_id", clubId)
    .eq("active", true)
    .maybeSingle();
  const playersPromise = onzio
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("active", true);
  const staffPromise = onzio
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("club_id", clubId)
    .eq("active", true);
  const tryoutsPromise = onzio
    .from("tryouts")
    .select("id,event_date,headline,location,status,sort_order")
    .eq("club_id", clubId)
    .in("status", ["upcoming", "open"])
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .order("sort_order", { ascending: true });
  const formsPromise = onzio
    .from("registration_forms")
    .select("id,title,status,created_at,archived_at")
    .eq("club_id", clubId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const paidPromise = readAllPaidRegistrations(onzio, clubId);

  const activeSeasonResult = await activeSeasonPromise;
  const activeSeason = activeSeasonResult.error
    ? null
    : (activeSeasonResult.data as { id: string; label: string } | null);

  const [playersResult, staffResult, matchesResult, tryoutsResult, formsResult, paidResult] =
    await Promise.allSettled([
      playersPromise,
      staffPromise,
      activeSeason
        ? onzio
            .from("matches")
            .select("id,date,time,opponent,home,venue")
            .eq("club_id", clubId)
            .eq("season_id", activeSeason.id)
            .order("date", { ascending: true })
            .order("time", { ascending: true })
        : Promise.resolve({ data: [], count: 0, error: null }),
      tryoutsPromise,
      formsPromise,
      paidPromise,
    ]);

  const countSection = (
    result: PromiseSettledResult<{ count: number | null; error: { message: string } | null }>,
    label: string,
  ): DashboardSection<number> => {
    if (result.status === "rejected" || result.value.error) {
      return failed(`Could not load ${label}.`);
    }
    return ready(result.value.count ?? 0);
  };

  const players = countSection(playersResult, "active players");
  const staff = countSection(staffResult, "active staff");

  let seasonMatches: DashboardSection<number>;
  let events: DashboardSection<DashboardEvent[]>;
  if (matchesResult.status === "rejected" || matchesResult.value.error) {
    seasonMatches = failed("Could not load season matches.");
    events = failed("Could not load upcoming fixtures.");
  } else {
    const matches = (matchesResult.value.data ?? []) as Array<{
      id: string;
      date: string;
      time: string;
      opponent: string;
      home: boolean;
      venue: string;
    }>;
    seasonMatches = ready(matches.length);
    const fixtures = matches
      .filter((match) => match.date >= today)
      .map<DashboardEvent>((match) => ({
        id: `fixture-${match.id}`,
        kind: "fixture",
        date: match.date,
        time: match.time,
        title: `${match.home ? "vs" : "at"} ${match.opponent}`,
        detail: match.venue || (match.home ? "Home" : "Away"),
      }));

    if (tryoutsResult.status === "rejected" || tryoutsResult.value.error) {
      events = failed("Could not load upcoming fixtures and events.");
    } else {
      const tryouts = (tryoutsResult.value.data ?? []) as Array<{
        id: string;
        event_date: string | null;
        headline: string;
        location: string;
      }>;
      events = ready(
        [
          ...fixtures,
          ...tryouts
            .filter((tryout) => Boolean(tryout.event_date))
            .map<DashboardEvent>((tryout) => ({
              id: `tryout-${tryout.id}`,
              kind: "tryout",
              date: tryout.event_date!,
              time: null,
              title: tryout.headline,
              detail: tryout.location || "Location to be announced",
            })),
        ]
          .sort(
            (left, right) =>
              `${left.date}T${left.time ?? "23:59"}`.localeCompare(
                `${right.date}T${right.time ?? "23:59"}`,
              ) || left.id.localeCompare(right.id),
          )
          .slice(0, 8),
      );
    }
  }

  let forms: DashboardSection<DashboardForm[]>;
  let registrationMix: DashboardSection<RegistrationMixItem[]>;
  const formRows =
    formsResult.status === "fulfilled" && !formsResult.value.error
      ? ((formsResult.value.data ?? []) as Array<{
          id: string;
          title: string;
          status: string;
          created_at: string;
        }>)
      : null;
  const paidRows = paidResult.status === "fulfilled" ? paidResult.value : null;

  if (!formRows) {
    forms = failed("Could not load registration forms.");
    registrationMix = failed("Could not load registration mix.");
  } else {
    forms = ready(
      formRows.map((form) => ({
        id: form.id,
        title: form.title,
        status: form.status,
        createdAt: form.created_at,
      })),
    );
    registrationMix = paidRows
      ? ready(
          buildRegistrationMix(
            formRows.map((form) => ({
              id: form.id,
              title: form.title,
              createdAt: form.created_at,
            })),
            paidRows,
          ),
        )
      : failed("Could not load registration mix.");
  }

  const paidRegistrations = paidRows
    ? ready(paidRows.length)
    : failed<number>("Could not load paid registrations.");

  return {
    activeSeasonLabel: activeSeason?.label ?? null,
    players,
    staff,
    seasonMatches: activeSeasonResult.error
      ? failed("Could not load the active season.")
      : seasonMatches,
    paidRegistrations,
    forms,
    events,
    registrationMix,
  };
}
