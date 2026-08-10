"use client";

import { useClubId } from "@/components/ClubContextProvider";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchActiveSeason } from "@/lib/queries";
import { createClient } from "@/lib/admin-client";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

type Stats = {
  players: number;
  staff: number;
  matches: number;
  nextMatch: { date: string; opponent: string; home: boolean } | null;
  seasonLabel: string;
};

export default function AdminDashboard() {
  const clubId = useClubId();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [
        { count: players },
        { count: staff },
        activeSeason,
      ] = await Promise.all([
        supabase.from("players").select("*", { count: "exact", head: true }).eq("active", true),
        supabase.from("staff").select("*", { count: "exact", head: true }).eq("active", true),
        fetchActiveSeason(clubId),
      ]);

      const { data: matches } = activeSeason
        ? await supabase
            .from("matches")
            .select("date, opponent, home, time")
            .eq("season_id", activeSeason.id)
        : { data: [] };

      // Find next upcoming match
      const now = new Date();
      const upcoming = (matches ?? [])
        .filter((m: { date: string; time?: string | null }) => new Date(`${m.date}T${m.time ?? "00:00"}`) >= now)
        .sort((a: { date: string; time?: string | null }, b: { date: string; time?: string | null }) => `${a.date}T${a.time ?? "00:00"}` < `${b.date}T${b.time ?? "00:00"}` ? -1 : 1);

      setStats({
        players: players ?? 0,
        staff: staff ?? 0,
        matches: matches?.length ?? 0,
        nextMatch: upcoming[0] ?? null,
        seasonLabel: activeSeason?.label ?? "No active season",
      });
      setLoading(false);
    }
    load();
  }, [clubId]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="font-display font-black uppercase text-white leading-none"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Dashboard
        </h1>
        <p className="font-body text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
          {loading ? "Loading season…" : `${stats?.seasonLabel ?? "No active season"}${stats?.seasonLabel === "No active season" ? "" : " Season"}`}
        </p>
      </div>

      {/* Stat cards */}
      <div className="dark grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Players" value={String(stats?.players ?? 0)} loading={loading} />
        <StatCard label="Staff"   value={String(stats?.staff ?? 0)} loading={loading} />
        <StatCard label="Matches" value={String(stats?.matches ?? 0)} loading={loading} />
        <StatCard
          label="Next Match"
          value={stats?.nextMatch ? formatDate(stats.nextMatch.date) : "TBD"}
          sub={stats?.nextMatch ? `vs ${stats.nextMatch.opponent}` : undefined}
          loading={loading}
          accent
        />
      </div>

      {/* Quick actions */}
      <div className="mb-4">
        <h2
          className="font-display font-bold uppercase tracking-widest mb-4"
          style={{ fontSize: "1rem", color: "rgba(255,255,255,0.3)" }}
        >
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <ActionCard
            href="/admin/stats"
            title="Enter Match Stats"
            description="Log goals, assists, saves and minutes for a completed match."
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <ActionCard
            href="/admin/seasons"
            title="Manage Seasons"
            description="Create the next season or change which season is active."
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 2v4M16 2v4M3 9h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            }
          />
          <ActionCard
            href="/admin/roster"
            title="Manage Roster"
            description="Add, edit, or deactivate players and staff members."
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M19 8v6M16 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            }
          />
          <ActionCard
            href="/admin/schedule"
            title="Manage Schedule"
            description="Add upcoming fixtures or update match details."
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M12 14v4M10 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            }
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: accent ? "rgba(34,197,94,0.12)" : "#1a1a1a",
        border: `1px solid ${accent ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <p
        className="font-display tracking-widest uppercase mb-2"
        style={{ fontSize: "0.985rem", color: accent ? "rgba(34,197,94,0.9)" : "rgba(255,255,255,0.3)" }}
      >
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-[clamp(1.8rem,3vw,2.5rem)] w-16" />
      ) : (
        <p
          className="font-display font-black text-white leading-none"
          style={{ fontSize: "clamp(1.8rem, 3vw, 2.5rem)" }}
        >
          {value}
        </p>
      )}
      {loading && accent ? (
        <Skeleton className="mt-2 h-3 w-24" />
      ) : (
        sub && (
          <p className="font-body mt-1 truncate" style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.4)" }}>
            {sub}
          </p>
        )
      )}
    </div>
  );
}

function ActionCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl p-5 transition-all duration-200"
      style={{
        backgroundColor: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(220,38,38,0.3)";
        (e.currentTarget as HTMLElement).style.backgroundColor = "#1e1e1e";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)";
        (e.currentTarget as HTMLElement).style.backgroundColor = "#1a1a1a";
      }}
    >
      <div className="mb-3" style={{ color: "#dc2626" }}>{icon}</div>
      <h3 className="font-display font-black uppercase text-white mb-1" style={{ fontSize: "1.5rem" }}>
        {title}
      </h3>
      <p className="font-body leading-relaxed" style={{ fontSize: "1.15rem", color: "rgba(255,255,255,0.35)" }}>
        {description}
      </p>
    </Link>
  );
}
