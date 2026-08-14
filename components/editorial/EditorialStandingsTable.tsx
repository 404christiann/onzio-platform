"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "@/components/ResilientImage";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { fetchLeagueStandings } from "@/lib/queries";
import { teamAbbreviation, type StandingsTableContent } from "@/lib/standings-content";

/**
 * Lions' public league table. The rows and the heading copy come from the
 * tenant's own `league_standings` / `league_standings_settings` records, so
 * the Standings admin page actually drives what visitors see. It used to be a
 * hardcoded module-level array, which meant the admin page wrote to tables
 * nothing on the public site ever read.
 *
 * Data flow follows the sibling EditorialSponsorCarousel: this stays a
 * self-fetching "use client" component that reads its tenant id from
 * useClubContext, rather than adding another prop to EditorialHome. Only the
 * hero is server-resolved and threaded through as a prop.
 */

const EMPTY_CONTENT: StandingsTableContent = {
  settings: { id: 1, eyebrow: "", title: "", intro: "", updated_at: "" },
  rows: [],
};

const COLUMNS: Array<{
  key: "played" | "wins" | "draws" | "losses" | "goal_difference" | "points";
  label: string;
}> = [
  { key: "played", label: "GP" },
  { key: "wins", label: "W" },
  { key: "draws", label: "D" },
  { key: "losses", label: "L" },
  { key: "goal_difference", label: "GD" },
  { key: "points", label: "PTS" },
];

function formatDifference(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export default function EditorialStandingsTable() {
  const club = useClubContext();
  const { crestUrl } = useEditorialIdentity();
  const [content, setContent] = useState<StandingsTableContent>(EMPTY_CONTENT);

  useEffect(() => {
    let cancelled = false;
    fetchLeagueStandings(club.id)
      .then((next) => {
        if (!cancelled) setContent(next);
      })
      .catch((error: unknown) => {
        console.error("EditorialStandingsTable:", error);
        if (!cancelled) setContent(EMPTY_CONTENT);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  // Render in the admin's saved row order (`sort_order`), which is the order
  // the club publishes its table in. fetchLeagueStandings hands rows back
  // re-sorted by points/goal difference, and that tie-break does not match
  // the real Ohio Valley Division table -- the three 5-point sides are
  // ordered by the league's own criteria, not by goal difference.
  const rows = useMemo(
    () => [...content.rows].sort((a, b) => a.sort_order - b.sort_order),
    [content.rows],
  );

  if (rows.length === 0) return null;

  const { settings } = content;

  return (
    <section className="editorial-standings" aria-label="League standings">
      <div className="editorial-standings-inner">
        <p className="editorial-standings-eyebrow">{settings.eyebrow}</p>
        <h2>{settings.title}</h2>
        {settings.intro ? (
          <p className="editorial-standings-intro">{settings.intro}</p>
        ) : null}

        <div className="editorial-standings-card">
          <div className="editorial-standings-row editorial-standings-row-head">
            <div className="editorial-standings-team-head">
              <span>#</span>
              <span>Team</span>
            </div>
            {COLUMNS.map((column) => (
              <span key={column.key}>{column.label}</span>
            ))}
          </div>

          {rows.map((row, index) => {
            const logoSrc = row.is_club ? crestUrl : row.logo_url;
            return (
              <div
                className="editorial-standings-row"
                data-club={row.is_club ? "true" : "false"}
                key={row.id}
              >
                <div className="editorial-standings-team">
                  <span className="editorial-standings-rank">{index + 1}</span>
                  {logoSrc ? (
                    <span className="editorial-standings-crest">
                      <Image
                        src={logoSrc}
                        alt=""
                        fill
                        sizes="40px"
                        className="editorial-standings-crest-img"
                        {...imageDeliveryProps(row.is_club ? "club-logo" : "opponent-crest")}
                      />
                    </span>
                  ) : (
                    <span
                      className="editorial-standings-abbr"
                      aria-label={`${row.team_name} logo placeholder`}
                    >
                      {row.team_abbreviation || teamAbbreviation(row.team_name)}
                    </span>
                  )}
                  <strong>{row.team_name}</strong>
                </div>
                {COLUMNS.map((column) => (
                  <span className="editorial-standings-stat" key={column.key}>
                    {column.key === "goal_difference"
                      ? formatDifference(row[column.key])
                      : row[column.key]}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
