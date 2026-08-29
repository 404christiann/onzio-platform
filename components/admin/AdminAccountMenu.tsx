"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AdminAccountMenu({
  email,
  role,
  onSignOut,
}: {
  email: string | null;
  role: "owner" | "admin" | null;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const initials = (email?.split("@")[0] ?? "Admin")
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-lg px-1.5 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials || <UserRound className="size-4" aria-hidden="true" />}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-36 truncate text-sm font-medium leading-4 text-foreground">
            {email ?? "Admin account"}
          </span>
          <span className="block text-xs capitalize text-muted-foreground">{role ?? "member"}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">{email ?? "Admin account"}</p>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">Club {role ?? "member"}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void onSignOut()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="size-4 text-muted-foreground" aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
