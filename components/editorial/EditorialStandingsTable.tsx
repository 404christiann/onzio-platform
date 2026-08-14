"use client";

import Image from "@/components/ResilientImage";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { teamAbbreviation } from "@/lib/standings-content";

type StandingRow = {
  team: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  points: number;
  isClub?: boolean;
};

const COLUMNS: Array<{
  key: "played" | "wins" | "draws" | "losses" | "goalDifference" | "points";
  label: string;
}> = [
  { key: "played", label: "GP" },
  { key: "wins", label: "W" },
  { key: "draws", label: "D" },
  { key: "losses", label: "L" },
  { key: "goalDifference", label: "GD" },
  { key: "points", label: "PTS" },
];

const STANDINGS: StandingRow[] = [
  { team: "Lions Football Club", played: 10, wins: 7, draws: 3, losses: 0, goalDifference: 21, points: 24, isClub: true },
  { team: "Leal United FC", played: 10, wins: 5, draws: 4, losses: 1, goalDifference: 11, points: 19 },
  { team: "Columbus Astray", played: 10, wins: 6, draws: 1, losses: 3, goalDifference: 7, points: 19 },
  { team: "Fut Ohio SC", played: 10, wins: 4, draws: 5, losses: 1, goalDifference: 27, points: 17 },
  { team: "Indy Gladiators SC", played: 10, wins: 3, draws: 5, losses: 2, goalDifference: 10, points: 14 },
  { team: "Manu Ledesma Academy", played: 10, wins: 4, draws: 2, losses: 4, goalDifference: 9, points: 8 },
  { team: "Ohio International FC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -30, points: 5 },
  { team: "Lightning SC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -27, points: 5 },
  { team: "Mahoning Trumbull United SC", played: 10, wins: 1, draws: 2, losses: 7, goalDifference: -28, points: 5 },
];

function formatDifference(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export default function EditorialStandingsTable() {
  const { crestUrl } = useEditorialIdentity();

  return (
    <section className="editorial-standings" aria-label="League standings">
      <div className="editorial-standings-inner">
        <p className="editorial-standings-eyebrow">League standings</p>
        <h2>Ohio Valley Division</h2>
        <p className="editorial-standings-intro">
          Current table for Lions Football Club&apos;s 2026 campaign.
        </p>

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

          {STANDINGS.map((row, index) => (
            <div
              className="editorial-standings-row"
              data-club={row.isClub ? "true" : "false"}
              key={row.team}
            >
              <div className="editorial-standings-team">
                <span className="editorial-standings-rank">{index + 1}</span>
                {row.isClub && crestUrl ? (
                  <span className="editorial-standings-crest">
                    <Image
                      src={crestUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="editorial-standings-crest-img"
                      {...imageDeliveryProps("club-logo")}
                    />
                  </span>
                ) : (
                  <span
                    className="editorial-standings-abbr"
                    aria-label={`${row.team} logo placeholder`}
                  >
                    {teamAbbreviation(row.team)}
                  </span>
                )}
                <strong>{row.team}</strong>
              </div>
              {COLUMNS.map((column) => (
                <span className="editorial-standings-stat" key={column.key}>
                  {column.key === "goalDifference"
                    ? formatDifference(row[column.key])
                    : row[column.key]}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
