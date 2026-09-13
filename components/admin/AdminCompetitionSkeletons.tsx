import { AdminSkeletonRegion } from "@/components/admin/AdminSkeletonRegion";
import { Skeleton } from "@/components/ui/skeleton";

/** Reserves the same position-card, column-header and input-row structure as
 * both stats editors, including their clipped horizontal table on mobile. */
export function AdminStatsGroupsSkeleton({
  label,
  groups = [3, 3],
}: {
  label: string;
  groups?: number[];
}) {
  return (
    <AdminSkeletonRegion label={label} className="space-y-4">
      {groups.map((count, groupIndex) => (
        <div key={groupIndex} className="overflow-hidden rounded-xl border border-border">
          <div className="flex items-center justify-between bg-card px-4 py-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="size-4" />
          </div>
          <div className="overflow-hidden">
            <div className="min-w-[600px]">
              <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-2">
                <Skeleton className="h-4 w-7" />
                <Skeleton className="h-4 w-32" />
                {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-4 flex-1" />)}
              </div>
              {Array.from({ length: Math.max(count, 1) }, (_, index) => (
                <div key={index} className="flex items-center gap-4 border-b border-border/40 px-4 py-2 last:border-0">
                  <Skeleton className="h-4 w-7" />
                  <Skeleton className="h-4 w-32" />
                  {Array.from({ length: 7 }, (_, column) => <Skeleton key={column} className="h-8 flex-1" />)}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </AdminSkeletonRegion>
  );
}
