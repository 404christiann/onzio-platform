"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchPlayerMatchTrend, fetchPlayerProfile } from "@/lib/queries";
import type { Player } from "@/lib/data";
import type { PlayerMatchTrendPoint } from "@/lib/queries";

type PlayerProfileData = Awaited<ReturnType<typeof fetchPlayerProfile>>;

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { first: name, last: "" };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts.at(-1) ?? "",
  };
}

function statCards(player: Player) {
  if ("saves" in player.stats) {
    return [
      ["Starts", player.stats.starts],
      ["Saves", player.stats.saves],
      ["Clean sheets", player.stats.cleanSheets],
      ["Minutes", player.stats.mins],
    ];
  }
  return [
    ["Starts", player.stats.starts],
    ["Goals", player.stats.goals],
    ["Assists", player.stats.assists],
    ["Minutes", player.stats.mins],
  ];
}

function trendLabel(point: PlayerMatchTrendPoint) {
  return `${point.opponent}: ${point.value}`;
}

export default function ClubhousePlayerProfilePage({
  playerId,
}: {
  playerId: string;
}) {
  const club = useClubContext();
  const isClubhouse = club.presentationTemplateKey === "clubhouse@1";
  const [profile, setProfile] = useState<PlayerProfileData>(null);
  const [trend, setTrend] = useState<PlayerMatchTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isClubhouse) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPlayerProfile(playerId, club.id)
      .then(async (nextProfile) => {
        if (cancelled) return;
        setProfile(nextProfile);
        if (nextProfile) {
          const isGoalkeeper = "saves" in nextProfile.player.stats;
          const points = await fetchPlayerMatchTrend(
            playerId,
            isGoalkeeper,
            nextProfile.seasonId,
            club.id,
          );
          if (!cancelled) setTrend(points.slice(-6));
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load player.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id, isClubhouse, playerId]);

  const player = profile?.player ?? null;
  const name = useMemo(() => splitName(player?.name ?? ""), [player?.name]);
  const cards = player ? statCards(player) : [];

  if (!isClubhouse) {
    return (
      <main className="clubhouse-route-page">
        <div className="clubhouse-route-state">Profile unavailable.</div>
      </main>
    );
  }

  return (
    <main className="clubhouse-route-page clubhouse-profile-page">
      <section className="clubhouse-profile-shell">
        <Link href="/roster" className="clubhouse-detail-back">
          Back to roster
        </Link>

        {loading && <div className="clubhouse-route-state">Loading profile...</div>}
        {error && !loading && <div className="clubhouse-route-state">{error}</div>}
        {!loading && !error && !player && (
          <div className="clubhouse-route-state">Player not found.</div>
        )}
        {!loading && !error && player && (
          <>
            <header className="clubhouse-profile-hero">
              <div className="clubhouse-profile-number">{player.number}</div>
              <div>
                <p className="clubhouse-eyebrow">{player.position} / {profile?.seasonLabel}</p>
                <h1>
                  {name.first}
                  <br />
                  <em>{name.last}</em>
                </h1>
                <p>
                  {player.hometown} / {player.height} / {player.foot ?? "First team"}
                </p>
              </div>
            </header>

            <section className="clubhouse-profile-grid">
              <article className="clubhouse-profile-bio">
                <span>Player bio</span>
                <h2>About {name.first}</h2>
                <p>
                  {player.bio ||
                    `${player.name} represents ${club.name} in the ${player.position.toLowerCase()} group, carrying the Capital City standard into every matchday.`}
                </p>
              </article>

              <aside className="clubhouse-profile-stats">
                <span>Season stats</span>
                <dl>
                  {cards.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            </section>

            <section className="clubhouse-profile-trend">
              <div>
                <span>Match rhythm</span>
                <h2>{trend.length ? "Recent output" : "Match logs pending"}</h2>
              </div>
              <div className="clubhouse-profile-trend-rail">
                {trend.length ? (
                  trend.map((point) => (
                    <div key={`${point.date}-${point.opponent}`}>
                      <strong>{point.value}</strong>
                      <span>{trendLabel(point)}</span>
                    </div>
                  ))
                ) : (
                  <p>Per-match stats will appear here once they are recorded.</p>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
