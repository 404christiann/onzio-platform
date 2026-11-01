"use client";

import { useEffect } from "react";

import { acquireAcademyPageScrollLock } from "@/lib/academy-page-scroll-lock";

export function useAcademyPageScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquireAcademyPageScrollLock(document);
  }, [active]);
}

/**
 * Academy loading surfaces follow the approved Header Stays direction.
 * Keep the page calm and the real header usable while content or media waits.
 * Existing export names remain stable for callers that were using Clear Frame.
 */
function QuietLoadingState({
  label,
  className,
  page = false,
}: {
  label: string;
  className: string;
  page?: boolean;
}) {
  return (
    <div
      data-academy-page-loading={page ? "" : undefined}
      className={"flex items-center justify-center bg-white px-6 " + className}
      aria-busy="true"
      role="status"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className="h-[17px] w-[17px] rounded-full border-2 border-[#cad8e3] border-t-[#426c88] motion-safe:animate-spin"
          aria-hidden="true"
        />
        <span className="font-display text-sm font-semibold tracking-[0.035em] text-[#51667E]">
          {label}
        </span>
      </div>
    </div>
  );
}

export function AcademyPageLoadingSkeleton({ label = "Loading page…" }: { label?: string }) {
  return <QuietLoadingState label={label} className="min-h-[100svh] pt-24 sm:pt-28" page />;
}

export function AcademyInteriorLoadingSkeleton({ shop = false }: { shop?: boolean }) {
  return <AcademyPageLoadingSkeleton label={shop ? "Loading store…" : "Loading page…"} />;
}

export function AcademyRosterLoadingSkeleton() {
  return <AcademyPageLoadingSkeleton label="Loading squad…" />;
}

export function AcademyScheduleLoadingSkeleton() {
  return <AcademyPageLoadingSkeleton label="Loading fixtures…" />;
}

export function AcademyHeroLoadingSkeleton({ clubName }: { clubName?: string }) {
  useAcademyPageScrollLock(true);

  return (
    <>
      <style>{`html:has([data-academy-hero-loading]), body:has([data-academy-hero-loading]) { overflow: hidden; }`}</style>
      <div data-academy-hero-loading="">
        <QuietLoadingState
          label={clubName ? "Loading " + clubName + "…" : "Loading home…"}
          className="fixed inset-0 z-40 min-h-[100svh] pt-24 sm:pt-28"
          page
        />
      </div>
    </>
  );
}

export function AcademyShopLoadingSkeleton() {
  return <QuietLoadingState label="Loading club store…" className="min-h-[680px]" />;
}

export function AcademyMatchLoadingSkeleton() {
  return <QuietLoadingState label="Loading next match…" className="min-h-[360px]" />;
}

export function AcademyStoryLoadingSkeleton() {
  return <QuietLoadingState label="Loading club story…" className="min-h-[560px]" />;
}

export function AcademySectionLoadingSkeleton({
  height = "min-h-64",
  label = "Loading section…",
}: {
  height?: string;
  label?: string;
}) {
  return <QuietLoadingState label={label} className={height} />;
}
