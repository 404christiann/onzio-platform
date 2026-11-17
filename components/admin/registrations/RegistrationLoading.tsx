"use client";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { useDelayedLoading } from "@/components/admin/ui/useDelayedLoading";
import type { ReactNode } from "react";

export function RegistrationLoading({ loading, quietRefresh = false, children }: { loading: boolean; quietRefresh?: boolean; children: ReactNode }) {
 const { phase, showContent } = useDelayedLoading(loading, { quietRefresh });
 const initial = phase === "waiting" || phase === "skeleton" || phase === "crossfade";
 return <div className="registration-loading" data-phase={phase} aria-busy={phase !== "content"} data-admin-loading-region="">
  {initial && <div className="registration-skeleton" data-admin-skeleton-layer="" role="status" aria-label="Loading registrations" aria-hidden={phase !== "skeleton" || undefined}>
   <div className="registration-form-cards">{Array.from({ length: 4 }, (_, i) => <div className="registration-form-card" key={i}><Shimmer className="h-5 w-4/5 rounded" /><Shimmer className="h-3 w-1/2 rounded" /><Shimmer className="h-6 w-24 rounded-full" /></div>)}<div className="registration-form-card registration-all-card"><Shimmer className="h-5 w-24 rounded" /><Shimmer className="h-3 w-4/5 rounded" /></div></div>
   <div className="registration-skeleton-tabs"><Shimmer className="h-5 w-28 rounded" /><Shimmer className="h-5 w-20 rounded" /></div>
   <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 },(_, i)=><div className="rounded-2xl border border-border bg-card p-4" key={i}><Shimmer className="h-3 w-16 rounded" /><Shimmer className="mt-3 h-8 w-20 rounded" /></div>)}</div>
   <div className="registration-skeleton-table"><div className="registration-skeleton-toolbar"><Shimmer className="h-11 w-64 max-w-full rounded-xl" /><Shimmer className="h-11 w-28 rounded-full" /></div>{Array.from({length:6},(_,i)=><div className="registration-skeleton-row" key={i}><Shimmer className="h-4 w-2/5 rounded" /><Shimmer className="h-4 w-1/5 rounded" /><Shimmer className="h-6 w-16 rounded-full" /></div>)}</div>
  </div>}
  {showContent && <div className="registration-loaded" data-admin-content-layer="">{children}</div>}
 </div>;
}
