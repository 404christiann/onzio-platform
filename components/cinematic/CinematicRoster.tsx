"use client";

import { useRef, useState } from "react";
import PlayerModal from "@/components/PlayerModal";
import NationalityFlag from "@/components/NationalityFlag";
import ResilientImage from "@/components/ResilientImage";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { getRosterImageSrc } from "@/lib/roster-images";
import type { Player } from "@/lib/data";
import type { fetchRoster } from "@/lib/queries";
import "./roster.css";

export type CinematicRosterData = Awaited<ReturnType<typeof fetchRoster>>;

function PlayerName({ player }: { player: Player }) {
  return <>{player.name.trim()}{player.caption ? <span className="squad-caption"> {player.caption === "(C)" ? "C" : player.caption}</span> : null}</>;
}

function Stats({ player }: { player: Player }) {
  const stats = player.stats;
  const values = "saves" in stats
    ? [["Saves", stats.saves], ["Clean sheets", stats.cleanSheets], ["Mins", stats.mins]]
    : [["Goals", stats.goals], ["Assists", stats.assists], ["Mins", stats.mins]];
  return <div className="squad-stats" aria-label="Season statistics">
    {values.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
  </div>;
}

export default function CinematicRoster({ roster }: { roster: CinematicRosterData }) {
  const { clubLogoUrl } = useClubBranding();
  const [selected, setSelected] = useState<Player | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const groups = [
    { label: "Defenders", players: roster.defenders },
    { label: "Midfielders", players: roster.midfielders },
    { label: "Forwards", players: roster.forwards },
    { label: "Goalkeepers", players: roster.goalkeepers },
  ];
  const hasPlayers = groups.some((group) => group.players.length > 0);

  function closeProfile() {
    setSelected(null);
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }));
  }

  return <div className="cinematic-roster">
    <header className="squad-heading">
      <p>{roster.seasonLabel}{/season$/i.test(roster.seasonLabel) ? "" : " Season"}</p>
      <h1>The Squad</h1>
      <div className="squad-rule" />
    </header>
    {hasPlayers ? groups.filter((group) => group.players.length > 0).map((group) => (
      <section className="squad-group" key={group.label} aria-labelledby={`roster-${group.label.toLowerCase()}`}>
        <div className="squad-group-heading">
          <h2 id={`roster-${group.label.toLowerCase()}`}>{group.label}</h2>
          <div aria-hidden="true" />
          <span>{group.players.length}<span className="sr-only"> players</span></span>
        </div>
        <div className="squad-grid">
          {[...group.players].sort((a, b) => a.number - b.number || a.name.localeCompare(b.name)).map((player) => (
            <button type="button" className="squad-card" key={player.id ?? `${player.position}-${player.number}-${player.name}`}
              data-player-id={player.id} aria-label={`View ${player.name.trim()} profile`} aria-haspopup="dialog"
              onClick={(event) => { opener.current = event.currentTarget; setSelected(player); }}>
              <div className="squad-portrait">
                <ResilientImage src={getRosterImageSrc(player.image, clubLogoUrl)} alt={player.name.trim()} fill unoptimized
                  sizes="(max-width: 600px) 85vw, (max-width: 900px) 42vw, 28vw" data-roster-card-image="true" />
              </div>
              <div className="squad-summary">
                <div className="squad-number-flag"><span className="squad-number">{player.number}</span>
                  <NationalityFlag nationality={player.nationality} width={33} className="squad-flag" />
                </div>
                <h3><PlayerName player={player} /></h3>
                <p className="squad-hometown">{player.hometown}</p>
              </div>
              <div className="squad-detail"><Stats player={player} /><span className="squad-profile-hint">Tap for full profile</span></div>
            </button>
          ))}
        </div>
      </section>
    )) : <p className="cinematic-roster-empty" role="status">The squad will be announced soon.</p>}
    {selected ? <PlayerModal player={selected} seasonLabel={roster.seasonLabel} presentation="cinematic" onClose={closeProfile} /> : null}
  </div>;
}
