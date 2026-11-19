"use client";

import type { MouseEvent } from "react";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import NationalityFlag from "@/components/NationalityFlag";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { KIT_EDIT_PROPS } from "@/components/admin/ui/editor-kit";
import { getRosterImageSrc, isRosterPlaceholderLogo } from "@/lib/roster-images";
import type { Player } from "../roster-model";
import { ROSTER_POSITION_ABBR, cardStats, initialsOf, type SeasonLine } from "./rose-city-roster-model";
import styles from "./rose-city-roster.module.css";

export type RosterPlayerCardProps = {
  player: Player;
  /** Undefined until the season totals have loaded: the stats strip stays out rather than show zeros. */
  totals: SeasonLine | undefined;
  flash: boolean;
  /** The show/hide switch is writing; it is disabled until it finishes. */
  switching: boolean;
  onEdit: (event: MouseEvent<HTMLButtonElement>) => void;
  onVisibleChange: (visible: boolean) => void;
};

/** One player as the public Squad shows them, plus what the admin needs: Edit, a "No photo" flag and the show/hide switch (the existing players.active). */
export function RosterPlayerCard({ player, totals, flash, switching, onEdit, onVisibleChange }: RosterPlayerCardProps) {
  const { clubLogoUrl } = useClubBranding();
  const hasPhoto = !isRosterPlaceholderLogo(player.photo_url);
  const name = player.name.trim();
  return (
    <li className={styles.item} data-player-id={player.id} data-hidden={player.active ? undefined : ""} data-flash={flash ? "" : undefined}>
      <button type="button" className={`admin-press ${styles.face}`} aria-label={`Edit ${name}`} onClick={onEdit} {...KIT_EDIT_PROPS}>
        <span className={styles.portrait}>
          {hasPhoto
            ? <ResilientNativeImage src={player.photo_url} alt="" fallback={initialsOf(name)} />
            : <ResilientNativeImage src={getRosterImageSrc(player.photo_url, clubLogoUrl)} alt="" data-placeholder="" fallback={initialsOf(name)} />}
        </span>
        <span className={styles.summary}>
          <span className={styles.numberRow}>
            <span className={styles.number}>{Number.isFinite(player.number) ? player.number : ""}</span>
            {player.nationality ? <NationalityFlag nationality={player.nationality} width={28} /> : null}
          </span>
          <span className={styles.name}>
            {name}{player.caption ? <span className={styles.caption}> {player.caption === "(C)" ? "C" : player.caption}</span> : null}
          </span>
          <span className={styles.hometown}>{ROSTER_POSITION_ABBR[player.position]} · {player.hometown}</span>
        </span>
        {totals && (
          <span className={styles.stats} aria-hidden="true">
            {cardStats(player, totals).map(([label, value]) => <span key={label}><strong>{value}</strong><span>{label}</span></span>)}
          </span>
        )}
      </button>
      <div className={styles.foot}>
        <span className={styles.flags}>
          {!hasPhoto && <span className={`${styles.flag} ${styles.flagWarn}`}>No photo</span>}
          {!player.active && <span className={styles.flag}>Hidden</span>}
        </span>
        <span className={styles.visibility}>
          <span aria-hidden="true">{player.active ? "Shown" : "Hidden"}</span>
          <AdminSwitch checked={player.active} label={`Show ${name} on the public roster`} disabled={switching} onCheckedChange={onVisibleChange} />
        </span>
      </div>
    </li>
  );
}
