import {
  CalendarDays,
  ClipboardPenLine,
  CreditCard,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import AdminFullPageLoader from "@/components/admin/AdminFullPageLoader";
import { AdminRegistrationMixChart } from "@/components/admin/AdminRegistrationMixChart";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/AdminPage";
import {
  loadAdminDashboardData,
  type DashboardEvent,
  type DashboardSection,
} from "@/lib/admin-dashboard-data";
import { REGISTRATION_MIX_COLORS } from "@/lib/admin-dashboard-mix";
import { requireFreshClubSession } from "@/lib/auth-session";
import { isBillingAdminEmail } from "@/lib/billing-admin";
import { getClubContext } from "@/lib/club-context";
import {
  getVisibleAdminQuickActions,
  type AdminQuickActionId,
} from "@/lib/admin-route-manifest";
import { createClient } from "@/lib/supabase-server";

const ACTION_ICONS: Record<AdminQuickActionId, LucideIcon> = {
  registrations: ClipboardPenLine,
  "manage-roster": Users,
  "manage-schedule": CalendarDays,
  payments: CreditCard,
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
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
 * `AdminFullPageLoader` shows for the initial load, instead of a blank page,
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
    <Suspense fallback={<AdminFullPageLoader label="Loading dashboard" />}>
      <AdminDashboardContent />
    </Suspense>
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
  const { data: userData } = await supabase.auth.getUser();
  const isBillingAuthorized =
    club.role === "owner" && isBillingAdminEmail(userData.user?.email);
  const canMutateContent =
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"));
  const quickActions = getVisibleAdminQuickActions({
    role: club.role,
    presentationTemplateKey: club.presentationTemplateKey,
    isBillingAuthorized,
    canMutateContent,
  });
  const data = await loadAdminDashboardData(supabase, club.id);

  return (
    <AdminPage>
      <AdminPageHeader
        title="Dashboard"
        description={
          data.activeSeasonLabel
            ? `${data.activeSeasonLabel} season overview`
            : "Club operations overview"
        }
      />

      <section aria-label="Club statistics" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Active Players" section={data.players} />
        <MetricCard label="Active Staff" section={data.staff} />
        <MetricCard label="Season Matches" section={data.seasonMatches} />
        <MetricCard label="Paid Registrations" section={data.paidRegistrations} />
      </section>

      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="mb-3 text-sm font-semibold text-foreground">
          Quick Actions
        </h2>
        {quickActions.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = ACTION_ICONS[action.id];
              return (
                <Link
                  key={action.id}
                  href={action.href}
                  title={action.description}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-card-foreground">
                      {action.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {action.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState message="Quick actions are unavailable while content changes are paused." />
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardPanel title="Registration Forms" actionHref="/admin/registrations" actionLabel="View all">
          {data.forms.status === "error" ? (
            <SectionError message={data.forms.message} />
          ) : data.forms.data.length ? (
            <ul className="divide-y divide-border">
              {data.forms.data.slice(0, 6).map((form) => (
                <li key={form.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-card-foreground" title={form.title}>
                      {form.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created {formatDate(form.createdAt.slice(0, 10))}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                      form.status === "open"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {form.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No current registration forms." />
          )}
        </DashboardPanel>

        <DashboardPanel title="Upcoming Fixtures & Events" actionHref="/admin/schedule" actionLabel="View schedule">
          {data.events.status === "error" ? (
            <SectionError message={data.events.message} />
          ) : data.events.data.length ? (
            <ul className="divide-y divide-border">
              {data.events.data.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
          ) : (
            <EmptyState message="No upcoming fixtures or events." />
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel title="Registration Mix" description="Paid registrations across current forms">
        {data.registrationMix.status === "error" ? (
          <SectionError message={data.registrationMix.message} />
        ) : data.registrationMix.data.length ? (
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(240px,360px)_1fr]">
            <div className="mx-auto h-72 w-full max-w-sm">
              <AdminRegistrationMixChart items={data.registrationMix.data} />
            </div>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Paid registrations by current registration form</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th scope="col" className="pb-2 pr-4 font-medium">Form</th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">Paid</th>
                    <th scope="col" className="pb-2 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.registrationMix.data.map((item, index) => (
                    <tr key={item.id}>
                      <th scope="row" className="max-w-0 py-3 pr-4 font-medium text-card-foreground">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                REGISTRATION_MIX_COLORS[index % REGISTRATION_MIX_COLORS.length],
                            }}
                            aria-hidden="true"
                          />
                          <span className="truncate" title={item.label}>{item.label}</span>
                        </span>
                      </th>
                      <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{item.count}</td>
                      <td className="py-3 text-right font-medium tabular-nums text-card-foreground">{item.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState message="Paid registrations will appear here once a current form receives payment." />
        )}
      </DashboardPanel>
    </AdminPage>
  );
}

function MetricCard({ label, section }: { label: string; section: DashboardSection<number> }) {
  return (
    <AdminPanel className="p-4 sm:p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      {section.status === "ready" ? (
        <p className="mt-3 text-[32px] font-bold leading-none tracking-tight tabular-nums text-card-foreground">
          {section.data.toLocaleString()}
        </p>
      ) : (
        <p className="mt-3 text-sm font-medium text-destructive" role="status">Unavailable</p>
      )}
    </AdminPanel>
  );
}

function DashboardPanel({
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <AdminPanel aria-labelledby={`${title.toLowerCase().replace(/[^a-z]+/g, "-")}-heading`}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id={`${title.toLowerCase().replace(/[^a-z]+/g, "-")}-heading`} className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="shrink-0 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </AdminPanel>
  );
}

function EventRow({ event }: { event: DashboardEvent }) {
  return (
    <li className="flex gap-4 py-3 first:pt-0 last:pb-0">
      <div className="w-16 shrink-0 rounded-lg bg-muted px-2 py-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(`${event.date}T12:00:00`))}
        </p>
        <p className="text-lg font-semibold leading-5 text-card-foreground">{Number(event.date.slice(-2))}</p>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-card-foreground" title={event.title}>{event.title}</p>
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-primary">
            {event.kind}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {[formatTime(event.time), event.detail].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{message}</p>;
}

function SectionError({ message }: { message: string }) {
  return <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{message}</p>;
}
