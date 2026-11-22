"use client";

// PROTOTYPE (UI-POLISH-INSIGHTS), throwaway: floating bar that cycles ?variant=.
// Hidden in production builds. Never reaches main.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function PrototypeSwitcher({ variants }: { variants: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const keys = Object.keys(variants);
  const current = params.get("variant") ?? keys[0];
  const index = Math.max(0, keys.indexOf(current));

  function go(step: number) {
    const next = new URLSearchParams(params);
    next.set("variant", keys[(index + step + keys.length) % keys.length]);
    router.replace(`${pathname}?${next}`);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1 text-sm text-white shadow-lg">
      <button type="button" className="size-9 rounded-full hover:bg-white/10" onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span className="tabular-nums">
        {keys[index]} ({variants[keys[index]]})
      </span>
      <button type="button" className="size-9 rounded-full hover:bg-white/10" onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}
