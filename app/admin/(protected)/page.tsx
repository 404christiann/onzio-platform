import { readAdminPortal } from "@/lib/admin-portal";
import {
  ChevronRight,
  IconSchedule,
  IconRegistrations,
  IconPayments,
  IconRoster,
  type AdminIconComponent
} from "@/components/admin/icons";
import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminRegistrationMixChart } from "@/components/admin/AdminRegistrationMixChart";
import { AdminPage } from "@/components/admin/AdminPage";
import {
  loadAdminDashboardData,
  type DashboardEvent,
  type DashboardSection,
} from "@/lib/admin-dashboard-data";
import { REGISTRATION_MIX_COLORS } from "@/lib/admin-dashboard-mix";
import { requireFreshClubSession } from "@/lib/auth-session";
import { clubToday } from "@/lib/club-time";
import { getClubContext } from "@/lib/club-context";
import {
  getVisibleAdminQuickActions,
  isAdminRouteHiddenForClub,
  type AdminQuickActionId,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import { createClient } from "@/lib/supabase-server";

const ACTION_ICONS: Record<AdminQuickActionId, AdminIconComponent> = {
  registrations: IconRegistrations,
  "manage-roster": IconRoster,
  "manage-schedule": IconSchedule,
  payments: IconPayments,
};

function formatDate(date: string, today: string) {
  // The year only when it is not the club's current year.
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(new Date(`${date}T12:00:00`));
}

function longDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatTime(time: string | null) {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hours, minutes));
}

/**
 * Route entry for `/admin`. Wraps the actual dashboard (which does its data
 * loading as an async Server Component) in a Suspense boundary so
 * container-shaped placeholders show for the initial load,
 * while `AdminDashboardContent` awaits the session/club/data lookups below.
 *
 * A shared `loading.tsx` file at `app/admin/(protected)/` was deliberately
 * not used for this: that folder is the parent route segment for every
 * protected admin page (tryouts, programs, standings, ...), so a loading
 * file there would show on navigation to all of them, not just the
 * Dashboard. This inline Suspense keeps the loader scoped to this one route.
 */
export default function AdminDashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AdminDashboardContent />
    </Suspense>
  );
}

// UI-POLISH-DASHBOARD: one radius (rounded-lg), hairline borders instead of
// shadows, three type sizes (text-xs, text-sm, text-2xl) and one accent
// (primary). The next game or event is the one heavy thing on the page.
const PANEL = "min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground sm:px-5";
// Cells sit on the border colour with a 1px gap, so dividers are hairlines.
// An odd last cell spans the row instead of leaving a grey hole.
const HAIRLINE_GRID = "grid gap-px overflow-hidden rounded-lg border border-border bg-border";
const STATS_GRID = `${HAIRLINE_GRID} grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2`;
// On wide screens the next game and the numbers share one row.
const LEAD_ROW = "grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";
const ACTIONS_GRID = `${HAIRLINE_GRID} sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2`;
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const TEXT_LINK = `inline-flex min-h-11 shrink-0 touch-manipulation items-center rounded-md text-sm font-medium text-primary underline-offset-4 [@media(hover:hover)]:hover:underline ${FOCUS}`;

function DashboardSkeleton() {
  return (
    <AdminPage className="gap-4">
      <header className="min-w-0">
        <AdminSkeletonRegion label="Loading club">
          <Skeleton className="my-1 h-6 w-48 max-w-full" />
          <Skeleton className="mt-2 h-4 w-24" />
        </AdminSkeletonRegion>
      </header>

      <div className={LEAD_ROW}>
      <section aria-label="Next up" className={`${PANEL} flex flex-col justify-center`}>
        <AdminSkeletonRegion label="Loading next game">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-3 h-7 w-64 max-w-full" />
          <Skeleton className="mt-2 h-5 w-48 max-w-full" />
        </AdminSkeletonRegion>
      </section>

      <section aria-label="Season numbers" className={STATS_GRID}>
        {["Active players", "Active staff", "Matches this season", "Paid registrations"].map((label) => (
          <div key={label} className="flex min-w-0 flex-col-reverse bg-card px-4 py-3 sm:px-5">
            <p className="mt-1 break-words text-sm text-muted-foreground">{label}</p>
            <AdminSkeletonRegion label={`Loading ${label.toLowerCase()}`}>
              <Skeleton className="h-8 w-14" />
            </AdminSkeletonRegion>
          </div>
        ))}
      </section>
      </div>

      <section aria-label="Quick actions">
        <h2 className="text-sm font-semibold normal-case text-foreground">Quick actions</h2>
        <AdminSkeletonRegion label="Loading quick actions" className={`${ACTIONS_GRID} mt-3`}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex min-h-12 items-center gap-3 bg-card px-4">
              <Skeleton className="size-5 shrink-0 rounded-md" />
              <Skeleton className="h-4 w-32 max-w-full" />
            </div>
          ))}
        </AdminSkeletonRegion>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardPanel title="Registration forms">
          <DashboardRowsSkeleton label="Loading registration forms" />
        </DashboardPanel>
        <DashboardPanel title="Coming up">
          <DashboardRowsSkeleton label="Loading games and events" />
        </DashboardPanel>
      </div>
      <DashboardPanel title="Paid registrations by form">
        <AdminSkeletonRegion label="Loading paid registrations by form" className="grid items-center gap-6 lg:grid-cols-[160px_1fr]">
          <Skeleton className="mx-auto size-40 rounded-full" />
          <div className="space-y-4">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 border-b border-border pb-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="ml-auto h-4 w-10" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </AdminSkeletonRegion>
      </DashboardPanel>
    </AdminPage>
  );
}

function DashboardIntro({ clubName, seasonLabel }: { clubName: string; seasonLabel: string | null }) {
  return (
    <header className="min-w-0">
      <h1 className="break-words text-2xl font-semibold normal-case leading-8 tracking-tight text-foreground">
        {clubName}
      </h1>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        {seasonLabel ? `${seasonLabel} season` : "No active season"}
      </p>
    </header>
  );
}

function DashboardRowsSkeleton({ label }: { label: string }) {
  return (
    <AdminSkeletonRegion label={label} className="divide-y divide-border">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-32 max-w-full" />
          </div>
          <Skeleton className="h-4 w-12 shrink-0" />
        </div>
      ))}
    </AdminSkeletonRegion>
  );
}

async function AdminDashboardContent() {
  const supabase = await createClient();
  const { userId } = await requireFreshClubSession(supabase);
  const requestHeaders = await headers();
  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
    userId,
  });
  // Same predicate as everywhere else Payments access is decided: an active
  // (non-archived) owner. AdminShell's sidebar/route-search check resolves
  // /api/stripe/billing-admin -> requireBillingRouteAuthorization ->
  // authorizeAdminAccess({ capability: "billing" }) (owner + not archived),
  // and app/admin/(protected)/payments/page.tsx redirects on exactly
  // `club.role !== "owner" || club.lifecycle === "archived"`. This used to
  // additionally gate on the BILLING_ADMIN_EMAIL(S) env allowlist
  // (lib/billing-admin.ts), which no other Payments surface consults — so
  // the sidebar and this quick action could disagree.
  const isBillingAuthorized =
    club.role === "owner" && club.lifecycle !== "archived";
  const canMutateContent =
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"));
  const routeAccess: AdminRouteAccessContext = {
    role: club.role,
    presentationTemplateKey: club.presentationTemplateKey,
    clubSlug: club.slug,
    isBillingAuthorized,
    canMutateContent,
    storeEnabled: club.storeEnabled,
  };
  const portal = await readAdminPortal(supabase, club.id);
  const quickActions = getVisibleAdminQuickActions(routeAccess);
  const { timeZone } = portal;
  const data = await loadAdminDashboardData(supabase, club.id, timeZone);
  const today = clubToday(timeZone);
  // A club whose admin hides Registrations (Rose City) gets no registration
  // metric, form list or mix; the rest of the dashboard is unchanged.
  const showRegistrations = !isAdminRouteHiddenForClub(club.slug, "registrations");
  // The first upcoming game or event leads the page; the panel lists the rest.
  const nextEvent = data.events.status === "ready" ? (data.events.data[0] ?? null) : null;

  return (
    <AdminPage className="gap-4">
      <DashboardIntro clubName={club.name} seasonLabel={data.activeSeasonLabel} />

      <div className={LEAD_ROW}>
      <NextUp events={data.events} today={today} />

      <section aria-label="Season numbers">
        <dl className={STATS_GRID}>
        <MetricCard label="Active players" section={data.players} />
        <MetricCard label="Active staff" section={data.staff} />
        <MetricCard label="Matches this season" section={data.seasonMatches} />
        {showRegistrations ? <MetricCard label="Paid registrations" section={data.paidRegistrations} /> : null}
        </dl>
      </section>
      </div>

      {/* Unauthorized actions disappear with no substitution; with none left the
          whole section is omitted and the page reflows. */}
      {quickActions.length ? (
        <section aria-labelledby="quick-actions-heading">
          <h2 id="quick-actions-heading" className="text-sm font-semibold normal-case text-foreground">
            Quick actions
          </h2>
          <ul className={`${ACTIONS_GRID} mt-3`}>
            {quickActions.map((action) => {
              const Icon = ACTION_ICONS[action.id];
              return (
                <li key={action.id} className="min-w-0 bg-card">
                  <Link
                    href={action.href}
                    title={action.description}
                    className={`flex min-h-12 touch-manipulation select-none items-center gap-3 px-4 text-sm font-medium text-card-foreground transition-colors duration-150 active:bg-muted [@media(hover:hover)]:hover:bg-muted/60 ${FOCUS} focus-visible:ring-inset focus-visible:ring-offset-0`}
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">{action.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className={showRegistrations ? "grid gap-4 xl:grid-cols-2" : "grid gap-4"}>
        {showRegistrations ? (
        <DashboardPanel title="Registration forms" actionHref="/admin/registrations" actionLabel="View all">
          {data.forms.status === "error" ? (
            <SectionError message={data.forms.message} />
          ) : data.forms.data.length ? (
            <ul className="divide-y divide-border">
              {data.forms.data.slice(0, 6).map((form) => (
                <li key={form.id} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-card-foreground" title={form.title}>
                      {form.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created {formatDate(form.createdAt.slice(0, 10), today)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium capitalize ${
                      form.status === "open" ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    {form.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No registration forms yet. Create one in Registrations to start taking sign-ups." />
          )}
        </DashboardPanel>
        ) : null}

        <DashboardPanel title="Coming up" actionHref="/admin/schedule" actionLabel="View schedule">
          {data.events.status === "error" ? (
            <SectionError message={data.events.message} />
          ) : data.events.data.length > 1 ? (
            <ul className="divide-y divide-border">
              {data.events.data.slice(1).map((event) => (
                <EventRow key={event.id} event={event} today={today} />
              ))}
            </ul>
          ) : (
            <EmptyState
              message={
                nextEvent
                  ? "Nothing else on the schedule after this one."
                  : "Nothing on the schedule yet."
              }
            />
          )}
        </DashboardPanel>
      </div>

      {showRegistrations ? (
      <DashboardPanel title="Paid registrations by form">
        {data.registrationMix.status === "error" ? (
          <SectionError message={data.registrationMix.message} />
        ) : data.registrationMix.data.length ? (
          <div className="grid items-center gap-6 lg:grid-cols-[160px_1fr]">
            <div className="mx-auto size-40">
              <AdminRegistrationMixChart items={data.registrationMix.data} />
            </div>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Paid registrations by current registration form</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="pb-2 pr-4 font-medium">Form</th>
                    <th scope="col" className="w-16 pb-2 pr-4 text-right font-medium">Paid</th>
                    <th scope="col" className="w-12 pb-2 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.registrationMix.data.map((item, index) => (
                    <tr key={item.id}>
                      <th scope="row" className="max-w-0 py-2 pr-4 font-medium text-card-foreground">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                REGISTRATION_MIX_COLORS[index % REGISTRATION_MIX_COLORS.length],
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate" title={item.label}>{item.label}</span>
                        </span>
                      </th>
                      <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-card-foreground">{formatCount(item.count)}</td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground">{item.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState message="Shows up once a form takes its first payment." />
        )}
      </DashboardPanel>
      ) : null}
    </AdminPage>
  );
}


function MetricCard({ label, section }: { label: string; section: DashboardSection<number> }) {
  // flex-col-reverse: the number reads first, while screen readers still get
  // the term before its value ("Active players, 24").
  return (
    <div className="flex min-w-0 flex-col-reverse bg-card px-4 py-3 sm:px-5">
      <dt className="mt-1 break-words text-sm text-muted-foreground">{label}</dt>
      {section.status === "ready" ? (
        <dd className="break-words text-2xl font-semibold leading-8 tracking-tight tabular-nums text-card-foreground">
          {formatCount(section.data)}
        </dd>
      ) : (
        <dd className="text-sm font-medium leading-8 text-destructive" role="status">Unavailable</dd>
      )}
    </div>
  );
}

function NextUp({ events, today }: { events: DashboardSection<DashboardEvent[]>; today: string }) {
  const next = events.status === "ready" ? (events.data[0] ?? null) : null;
  const days = next ? daysBetween(today, next.date) : null;
  const when = days === null ? null : days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 14 ? `In ${days} days` : null;
  return (
    <section aria-labelledby="next-up-heading" className={`${PANEL} flex flex-col justify-center`}>
      <h2 id="next-up-heading" className="text-sm font-medium normal-case text-muted-foreground">
        {next?.kind === "tryout" ? "Next event" : "Next game"}
      </h2>
      {events.status === "error" ? (
        <div className="mt-3">
          <SectionError message={events.message} />
        </div>
      ) : next ? (
        <>
          <p className="mt-1 break-words text-2xl font-semibold leading-8 tracking-tight text-card-foreground">
            {next.title}
          </p>
          <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
            {when ? <span className="font-semibold text-primary">{when} · </span> : null}
            {[longDate(next.date), formatTime(next.time), next.detail].filter(Boolean).join(" · ")}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold leading-8 tracking-tight text-card-foreground">Nothing scheduled</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4">
            <p className="text-sm leading-5 text-muted-foreground">
              Add your next game or tryout and it shows here and on your site.
            </p>
            <Link href="/admin/schedule" className={TEXT_LINK}>
              Open Schedule
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function DashboardPanel({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  const headingId = `${title.toLowerCase().replace(/[^a-z]+/g, "-")}-heading`;
  return (
    <section aria-labelledby={headingId} className={PANEL}>
      <div className="-mt-3 mb-1 flex min-h-11 flex-wrap items-center justify-between gap-x-4">
        <h2 id={headingId} className="min-w-0 break-words text-sm font-semibold normal-case text-foreground">
          {title}
        </h2>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className={TEXT_LINK}>
            {actionLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EventRow({ event, today }: { event: DashboardEvent; today: string }) {
  return (
    <li className="flex gap-4 py-2 first:pt-0 last:pb-0">
      <div className="w-10 shrink-0 text-center" aria-hidden="true">
        <span className="block text-xs font-medium uppercase text-muted-foreground">
          {new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${event.date}T12:00:00`))}
        </span>
        <span className="block text-sm font-semibold tabular-nums text-card-foreground">
          {Number(event.date.slice(-2))}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-card-foreground">
          <span className="sr-only">{longDate(event.date)}: </span>
          {event.title}
          {event.kind === "tryout" ? <span className="font-normal text-muted-foreground"> · Tryout</span> : null}
        </p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">
          {[formatTime(event.time), event.detail, event.date.slice(0, 4) !== today.slice(0, 4) ? event.date.slice(0, 4) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </li>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

function SectionError({ message }: { message: string }) {
  return <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{message}</p>;
}
