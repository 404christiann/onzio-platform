import { AdminPanel } from "@/components/admin/AdminPage";
import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";

function FieldSkeleton({ multiline = false }: { multiline?: boolean }) {
  return (
    <div className="min-w-0 space-y-2">
      <Skeleton className="h-3 w-28 max-w-full" />
      <Skeleton
        className={
          multiline ? "h-28 w-full rounded-lg" : "h-10 w-full rounded-lg"
        }
      />
    </div>
  );
}

function RailSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-card p-2 shadow-sm">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex min-h-10 items-center rounded-lg px-3 py-1.5"
        >
          <Skeleton
            className={
              index % 2 ? "h-4 w-24 max-w-full" : "h-4 w-32 max-w-full"
            }
          />
        </div>
      ))}
    </div>
  );
}

function PreviewSkeleton({
  title,
  className = "aspect-[4/3]",
}: {
  title: string;
  className?: string;
}) {
  return (
    <AdminPanel className="self-start overflow-hidden p-4 sm:p-5">
      <p className="font-display mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <Skeleton className={`${className} w-full rounded-lg`} />
    </AdminPanel>
  );
}

export function AboutContentSkeleton({
  hasClubLogoPage,
}: {
  hasClubLogoPage: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(12rem,15rem)_minmax(360px,1fr)_minmax(320px,1fr)]">
      <AdminSkeletonRegion
        label="Loading About sections"
        className="min-w-0 self-start space-y-4"
      >
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <RailSkeleton count={3} />
        </div>
        {hasClubLogoPage && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <RailSkeleton count={3} />
          </div>
        )}
      </AdminSkeletonRegion>
      <AdminSkeletonRegion
        label="Loading About story"
        className="min-w-0 self-start"
      >
        <AdminPanel className="p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_210px]">
            <div className="space-y-3">
              <FieldSkeleton />
              <div className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-56 w-full rounded-lg" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          </div>
        </AdminPanel>
      </AdminSkeletonRegion>
      <AdminSkeletonRegion
        label="Loading About preview"
        className="min-w-0 self-start"
      >
        <PreviewSkeleton title="About Preview" className="aspect-[3/4]" />
      </AdminSkeletonRegion>
    </div>
  );
}

export function HomepageContentSkeleton({
  sectionCount,
}: {
  sectionCount: number;
}) {
  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(12rem,15rem)_minmax(360px,1fr)_minmax(320px,26rem)]">
      <AdminSkeletonRegion
        label="Loading Homepage sections"
        className="min-w-0 self-start space-y-3"
      >
        <RailSkeleton count={sectionCount} />
        <div className="space-y-2 rounded-xl border border-border bg-card px-3.5 py-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </AdminSkeletonRegion>
      <AdminSkeletonRegion
        label="Loading homepage hero settings"
        className="min-w-0 self-start"
      >
        <AdminPanel className="space-y-4 p-4 sm:p-5">
          <div className="space-y-2">
            <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
              Hero
            </p>
            <Skeleton className="h-3 w-3/4" />
          </div>
          <FieldSkeleton />
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <FieldSkeleton multiline />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <FieldSkeleton key={index} />
            ))}
          </div>
          <Skeleton className="h-3 w-3/4" />
        </AdminPanel>
      </AdminSkeletonRegion>
      <AdminSkeletonRegion
        label="Loading Homepage preview"
        className="min-w-0 self-start"
      >
        <AdminPanel className="space-y-6 p-4 sm:p-5">
          <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
            Homepage Preview
          </p>
          <div className="space-y-4 rounded-lg border border-border p-5 sm:p-7">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-9 w-32" />
          </div>
          <Skeleton className="aspect-video w-full rounded-lg" />
        </AdminPanel>
      </AdminSkeletonRegion>
    </div>
  );
}

export function ContactContentSkeleton({
  label,
  isAcademy,
  hidesHeroImageField,
}: {
  label: string;
  isAcademy: boolean;
  hidesHeroImageField: boolean;
}) {
  return (
    <>
      <div
        className={
          isAcademy
            ? "grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(320px,380px)]"
            : "grid gap-6 lg:grid-cols-2"
        }
      >
        <AdminSkeletonRegion
          label={`${label}: destinations`}
          className="min-w-0"
        >
          <AdminPanel className="border-t-4 border-t-primary p-5 sm:p-7">
            <div className="mb-6 space-y-3 border-b border-border pb-5">
              <Skeleton className="h-7 w-36 rounded-full" />
              <h2 className="font-display text-2xl font-black uppercase text-foreground">
                Contact destinations
              </h2>
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <FieldSkeleton key={index} />
              ))}
            </div>
            <div className="mt-6 space-y-3 rounded-xl border border-border bg-muted/50 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </AdminPanel>
        </AdminSkeletonRegion>
        <AdminSkeletonRegion
          label="Loading Contact page presentation"
          className="min-w-0"
        >
          <AdminPanel className="p-5 sm:p-7">
            <div className="mb-6 space-y-3 border-b border-border pb-5">
              <Skeleton className="h-7 w-36 rounded-full" />
              <h2 className="font-display text-2xl font-black uppercase text-foreground">
                Page presentation
              </h2>
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-5">
              <FieldSkeleton />
              <FieldSkeleton />
              <FieldSkeleton multiline />
              {!hidesHeroImageField && (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="aspect-[16/7] w-full rounded-xl" />
                  <Skeleton className="h-10 w-40 rounded-lg" />
                </div>
              )}
            </div>
          </AdminPanel>
        </AdminSkeletonRegion>
        {isAcademy && (
          <AdminSkeletonRegion
            label="Loading Contact page preview"
            className="min-w-0 lg:col-span-2 xl:col-span-1"
          >
            <PreviewSkeleton
              title="Contact page preview"
              className="aspect-[3/4]"
            />
          </AdminSkeletonRegion>
        )}
      </div>
      <AdminSkeletonRegion
        label="Loading contact save controls"
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 sm:p-6"
      >
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="h-12 w-48 rounded-lg" />
      </AdminSkeletonRegion>
    </>
  );
}

export function ShopContentSkeleton({
  sectionCount,
}: {
  sectionCount: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminSkeletonRegion label="Loading shop editing controls">
        <AdminPanel className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:p-5">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-64 max-w-full sm:flex-1" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </AdminPanel>
      </AdminSkeletonRegion>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(11rem,14rem)_minmax(320px,420px)_minmax(0,1fr)]">
        <AdminSkeletonRegion
          label="Loading kit sections"
          className="min-w-0 self-start space-y-2"
        >
          <Skeleton className="h-3 w-20" />
          <RailSkeleton count={sectionCount} />
        </AdminSkeletonRegion>
        <AdminSkeletonRegion
          label="Loading kit content"
          className="min-w-0 self-start"
        >
          <AdminPanel className="space-y-4 p-4 sm:p-5">
            <div className="space-y-2">
              <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                Product
              </p>
              <Skeleton className="h-3 w-32" />
            </div>
            <FieldSkeleton />
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <FieldSkeleton multiline />
              <FieldSkeleton multiline />
            </div>
          </AdminPanel>
        </AdminSkeletonRegion>
        <AdminSkeletonRegion
          label="Loading kit preview"
          className="min-w-0 self-start space-y-3"
        >
          <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
            Preview
          </p>
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        </AdminSkeletonRegion>
      </div>
    </div>
  );
}

export function SponsorsContentSkeleton({
  hidesSponsorFooterTab,
}: {
  hidesSponsorFooterTab: boolean;
}) {
  return (
    <div
      className={`grid min-w-0 gap-6 ${!hidesSponsorFooterTab ? "xl:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]" : ""}`}
    >
      {!hidesSponsorFooterTab && (
        <AdminSkeletonRegion
          label="Loading sponsor placements"
          className="min-w-0 self-start"
        >
          <RailSkeleton count={2} />
        </AdminSkeletonRegion>
      )}
      <div className="flex min-w-0 flex-col gap-4">
        <AdminSkeletonRegion label="Loading sponsor logos">
          <AdminPanel className="p-4 sm:p-5">
            <div className="mb-3 space-y-2">
              <p className="font-display text-xs uppercase tracking-widest text-muted-foreground">
                Homepage Carousel Logos
              </p>
              <Skeleton className="h-3 w-3/4" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="min-w-0 space-y-2">
                  <Skeleton className="aspect-video w-full rounded-lg" />
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-7 w-28 max-w-full" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-3 h-28 w-full rounded-xl" />
          </AdminPanel>
        </AdminSkeletonRegion>
        <AdminSkeletonRegion label="Loading sponsor carousel preview">
          <PreviewSkeleton title="Carousel Preview" className="h-28" />
        </AdminSkeletonRegion>
      </div>
    </div>
  );
}
