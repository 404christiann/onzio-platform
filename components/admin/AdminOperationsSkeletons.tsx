import { AdminPanel, AdminPageToolbar } from "@/components/admin/AdminPage";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";

function FieldSkeleton({ multiline = false }: { multiline?: boolean }) {
  return (
    <div className="min-w-0 space-y-2">
      <Skeleton className="h-3 w-28 max-w-full" />
      <Skeleton
        className={
          multiline ? "h-24 w-full rounded-lg" : "h-11 w-full rounded-lg"
        }
      />
    </div>
  );
}

function SectionRailSkeleton({
  label,
  count = 3,
}: {
  label: string;
  count?: number;
}) {
  return (
    <AdminSkeletonRegion
      label={label}
      className="self-start rounded-xl border border-border bg-card p-2 shadow-sm"
    >
      <div className="space-y-2">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="space-y-2 rounded-lg px-3 py-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </AdminSkeletonRegion>
  );
}

export function OperationsToolbarSkeleton({ label }: { label: string }) {
  return (
    <AdminPageToolbar>
      <AdminSkeletonRegion label={label} className="w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-11 w-24 rounded-lg" />
            <Skeleton className="h-11 w-36 rounded-lg" />
          </div>
        </div>
      </AdminSkeletonRegion>
    </AdminPageToolbar>
  );
}

export function ProgramsCopySkeleton() {
  return (
    <div className="grid min-w-0 gap-6 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
      <SectionRailSkeleton label="Loading programs page sections" />
      <AdminPanel className="self-start p-4 sm:p-5">
        <h2 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
          Programs page copy
        </h2>
        <AdminSkeletonRegion label="Loading programs page copy">
          <div className="mt-2 space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
            <FieldSkeleton multiline />
            <div className="border-t border-border pt-6">
              <Skeleton className="h-11 w-40 rounded-lg" />
            </div>
          </div>
        </AdminSkeletonRegion>
      </AdminPanel>
    </div>
  );
}

function ProgramListSkeleton({ events = false }: { events?: boolean }) {
  return (
    <aside className="min-w-0 self-start space-y-3">
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <p className="px-3 pb-3 pt-2 font-display text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {events ? "Event order" : "Program order"}
        </p>
        <AdminSkeletonRegion
          label={events ? "Loading event list" : "Loading program list"}
        >
          <div className="space-y-2">
            {!events && <Skeleton className="mb-3 h-11 w-full rounded-lg" />}
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="space-y-2 rounded-xl border border-border p-4"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-5 w-20 rounded-full" />
                {events && (
                  <div className="grid grid-cols-2 gap-1 pt-2">
                    <Skeleton className="h-8 w-full rounded-md" />
                    <Skeleton className="h-8 w-full rounded-md" />
                  </div>
                )}
              </div>
            ))}
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </AdminSkeletonRegion>
      </div>
      {!events && (
        <AdminPanel className="p-4 sm:p-4">
          <AdminSkeletonRegion label="Loading program summary">
            <div className="space-y-3">
              <Skeleton className="h-3 w-28" />
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex justify-between gap-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </AdminSkeletonRegion>
        </AdminPanel>
      )}
    </aside>
  );
}

function PreviewSkeleton({ events = false }: { events?: boolean }) {
  return (
    <AdminPanel
      className={
        events ? "self-start lg:col-span-2 2xl:col-span-1" : "self-start"
      }
    >
      <AdminSkeletonRegion
        label={events ? "Loading tryout preview" : "Loading program preview"}
      >
        <div className="space-y-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-6 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </AdminSkeletonRegion>
    </AdminPanel>
  );
}

export function ProgramsWorkspaceSkeleton({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[19rem_minmax(0,1fr)_22rem]">
      <ProgramListSkeleton />
      <AdminPanel className="self-start p-5 sm:p-6">
        <AdminSkeletonRegion label={label}>
          <div className="space-y-6">
            <div className="flex gap-2 border-b border-border pb-3">
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-lg" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <FieldSkeleton key={index} />
              ))}
            </div>
            <FieldSkeleton multiline />
            <FieldSkeleton multiline />
          </div>
        </AdminSkeletonRegion>
      </AdminPanel>
      <PreviewSkeleton />
    </div>
  );
}

export function TryoutsWorkspaceSkeleton({
  label,
  pageIntro,
}: {
  label: string;
  pageIntro: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-6 sm:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
      <SectionRailSkeleton label="Loading tryout sections" count={2} />
      {pageIntro ? (
        <AdminPanel>
          <h2 className="font-display text-sm font-black uppercase tracking-wider text-foreground">
            Tryouts page intro
          </h2>
          <AdminSkeletonRegion label="Loading tryouts page intro">
            <div className="mt-3 space-y-5">
              <Skeleton className="h-12 w-full" />
              <FieldSkeleton multiline />
              <FieldSkeleton multiline />
              <Skeleton className="h-11 w-40 rounded-lg" />
            </div>
          </AdminSkeletonRegion>
        </AdminPanel>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)_22rem]">
          <ProgramListSkeleton events />
          <AdminPanel className="self-start p-5 sm:p-6">
            <AdminSkeletonRegion label={label}>
              <div className="space-y-6">
                <div className="space-y-3 border-b border-border pb-6">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
                <FieldSkeleton />
                <div className="grid gap-5 sm:grid-cols-2">
                  {Array.from({ length: 6 }, (_, index) => (
                    <FieldSkeleton key={index} />
                  ))}
                </div>
                <FieldSkeleton />
              </div>
            </AdminSkeletonRegion>
          </AdminPanel>
          <PreviewSkeleton events />
        </div>
      )}
    </div>
  );
}

export function AnalyticsWorkspaceSkeleton() {
  return (
    <>
      <AdminPageToolbar>
        <div>
          <p className="text-sm font-semibold text-foreground">
            Position group
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Narrow the roster without changing the season comparison.
          </p>
        </div>
        <AdminSkeletonRegion label="Loading position filters">
          <div className="flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-16 rounded-md" />
            ))}
          </div>
        </AdminSkeletonRegion>
      </AdminPageToolbar>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <AdminPanel as="aside">
          <h2 className="text-sm font-semibold text-foreground">Players</h2>
          <AdminSkeletonRegion label="Loading analytics players">
            <Skeleton className="mb-4 mt-2 h-3 w-24" />
            <div className="flex gap-2 overflow-hidden xl:flex-col">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="flex min-h-14 w-44 flex-none items-center gap-3 rounded-lg border border-border px-3 py-2 xl:w-full"
                >
                  <Skeleton className="h-10 w-10 flex-none rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          </AdminSkeletonRegion>
        </AdminPanel>
        <div className="flex min-w-0 flex-col gap-5">
          <AdminPanel>
            <AdminSkeletonRegion label="Loading player summary">
              <div className="flex items-center gap-4 sm:gap-5">
                <Skeleton className="h-16 w-16 flex-none rounded-xl sm:h-20 sm:w-20" />
                <div className="min-w-0 flex-1 space-y-3">
                  <Skeleton className="h-6 w-48 max-w-full" />
                  <Skeleton className="h-4 w-36 max-w-full" />
                </div>
                <Skeleton className="h-10 w-12 flex-none rounded-lg" />
              </div>
            </AdminSkeletonRegion>
          </AdminPanel>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <AdminPanel key={index} className="p-4 sm:p-5">
                <AdminSkeletonRegion
                  label={`Loading player metric ${index + 1}`}
                >
                  <Skeleton className="h-8 w-14" />
                  <Skeleton className="mt-2 h-3 w-20 max-w-full" />
                  <Skeleton className="mt-2 h-5 w-24 max-w-full" />
                </AdminSkeletonRegion>
              </AdminPanel>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {["Player profile", "Position comparison"].map((title) => (
              <AdminPanel key={title}>
                <h2 className="text-sm font-semibold text-foreground">
                  {title}
                </h2>
                <AdminSkeletonRegion label={`Loading ${title.toLowerCase()}`}>
                  <Skeleton className="mt-2 h-3 w-3/4" />
                  <Skeleton className="mt-5 h-64 w-full rounded-lg" />
                </AdminSkeletonRegion>
              </AdminPanel>
            ))}
          </div>
          <AdminPanel>
            <AdminSkeletonRegion label="Loading match trends">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="mt-2 h-3 w-40 max-w-full" />
              <Skeleton className="mt-4 h-48 w-full rounded-lg" />
            </AdminSkeletonRegion>
          </AdminPanel>
          <AdminPanel>
            <h2 className="text-sm font-semibold text-foreground">
              Discipline
            </h2>
            <AdminSkeletonRegion label="Loading discipline summary">
              <Skeleton className="mt-3 h-24 w-full rounded-lg" />
            </AdminSkeletonRegion>
          </AdminPanel>
        </div>
      </div>
    </>
  );
}

export function RegistrationsWorkspaceSkeleton() {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
      <AdminSkeletonRegion label="Loading registration forms">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-2 rounded-lg border border-border bg-muted/50 p-1">
            <Skeleton className="h-11 flex-1 rounded-md" />
            <Skeleton className="h-11 flex-1 rounded-md" />
          </div>
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="space-y-3 rounded-xl border border-l-4 border-border bg-background p-3.5 shadow-sm"
            >
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </AdminSkeletonRegion>
      <div className="min-w-0 space-y-4">
        <AdminPanel className="p-4">
          <AdminSkeletonRegion label="Loading registration editor">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-40" />
          </AdminSkeletonRegion>
        </AdminPanel>
        <AdminPanel className="overflow-hidden p-0 sm:p-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 py-4">
            <h3 className="font-display text-base font-bold uppercase">
              Basics
            </h3>
            <p className="text-sm text-muted-foreground">
              Name, description, who it is for
            </p>
          </div>
          <AdminSkeletonRegion label="Loading form basics" className="p-5">
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FieldSkeleton />
                <FieldSkeleton />
              </div>
              <FieldSkeleton multiline />
              <div className="rounded-xl border border-border p-4">
                <Skeleton className="h-4 w-32" />
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
          </AdminSkeletonRegion>
        </AdminPanel>
        {["Questions", "Price options", "Waiver and consent"].map((title) => (
          <AdminPanel key={title} className="overflow-hidden p-0 sm:p-0">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-display text-base font-bold uppercase">
                {title}
              </h3>
            </div>
            <AdminSkeletonRegion
              label={`Loading form ${title.toLowerCase()}`}
              className="p-5"
            >
              {title === "Questions" ? (
                <div className="space-y-4">
                  <Skeleton className="h-3 w-32" />
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 6 }, (_, index) => (
                      <Skeleton key={index} className="h-8 w-36 rounded-lg" />
                    ))}
                  </div>
                  <Skeleton className="h-3 w-28" />
                </div>
              ) : (
                <Skeleton
                  className={
                    title === "Waiver and consent"
                      ? "h-48 w-full rounded-lg"
                      : "h-24 w-full rounded-lg"
                  }
                />
              )}
            </AdminSkeletonRegion>
          </AdminPanel>
        ))}
      </div>
    </div>
  );
}
