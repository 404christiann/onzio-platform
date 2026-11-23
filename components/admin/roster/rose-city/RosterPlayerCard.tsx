"use client";

import type { MouseEvent } from "react";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import NationalityFlag from "@/components/NationalityFlag";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { KIT_EDIT_PROPS } from "@/components/admin/ui/editor-kit";
import { editTargetProps } from "@/lib/admin-edit-targets";
import { getRosterImageSrc, isRosterPlaceholderLogo } from "@/lib/roster-images";
import type { Player } from "../roster-model";
import { ROSTER_POSITION_ABBR, cardStats, initialsOf, type SeasonLine } from "./rose-city-roster-model";
import { cardStatField, clickTarget, hideFieldHover, rosterTarget, showFieldHover, type RosterField } from "./roster-edit-targets";
import styles from "./rose-city-roster.module.css";

export type RosterPlayerCardProps = {
  player: Player;
  /** Undefined until the season totals have loaded: the stats strip stays out rather than show zeros. */
  totals: SeasonLine | undefined;
  flash: boolean;
  /** The show/hide switch is writing; it is disabled until it finishes. */
  switching: boolean;
  /** `target` is the field under the pointer when the card was clicked with a mouse or touch; the Edit button's keyboard activation passes none. */
  onEdit: (event: MouseEvent<HTMLButtonElement>, target?: EditTargetId) => void;
  onVisibleChange: (visible: boolean) => void;
};

/** One player as the public Squad shows them, plus what the admin needs: Edit, a "No photo" flag and the show/hide switch (the existing players.active). */
export function RosterPlayerCard({ player, totals, flash, switching, onEdit, onVisibleChange }: RosterPlayerCardProps) {
  const { clubLogoUrl } = useClubBranding();
  const hasPhoto = !isRosterPlaceholderLogo(player.photo_url);
  const name = player.name.trim();
  // Click-to-field: every field on the card carries its edit target, keyed by the player's own id (never by position).
  const at = (field: RosterField) => editTargetProps(rosterTarget(player.id, field));
  return (
    <li className={styles.item} data-player-id={player.id} data-hidden={player.active ? undefined : ""} data-flash={flash ? "" : undefined}>
      <button type="button" className={`admin-press ${styles.face}`} aria-label={`Edit ${name}`} {...KIT_EDIT_PROPS}
        onClick={event => onEdit(event, clickTarget(event, player.id))}
        onPointerMove={event => { if (event.pointerType === "mouse") showFieldHover(event.currentTarget.parentElement as HTMLElement, player.id, event.clientX, event.clientY); }}
        onPointerLeave={event => hideFieldHover(event.currentTarget.parentElement as HTMLElement)}>
        <span className={styles.portrait} {...at("photo")}>
          {hasPhoto
            ? <ResilientNativeImage src={player.photo_url} alt="" fallback={initialsOf(name)} />
            : <ResilientNativeImage src={getRosterImageSrc(player.photo_url, clubLogoUrl)} alt="" data-placeholder="" fallback={initialsOf(name)} />}
        </span>
        <span className={styles.summary}>
          <span className={styles.numberRow}>
            <span className={styles.number} {...at("number")}>{Number.isFinite(player.number) ? player.number : ""}</span>
            {player.nationality ? <span className={styles.flagBox} {...at("nationality")}><NationalityFlag nationality={player.nationality} width={28} /></span> : null}
          </span>
          <span className={styles.name} {...at("name")}>
            {name}{player.caption ? <span className={styles.caption} {...(player.caption === "(C)" ? at("captain") : {})}> {player.caption === "(C)" ? "C" : player.caption}</span> : null}
          </span>
          <span className={styles.hometown} {...at("hometown")}><span {...at("position")}>{ROSTER_POSITION_ABBR[player.position]}</span> · {player.hometown}</span>
        </span>
        {totals && (
          <span className={styles.stats} aria-hidden="true">
            {cardStats(player, totals).map(([label, value]) => {
              const field = cardStatField(label);
              return <span key={label} {...(field ? at(field) : {})}><strong>{value}</strong><span>{label}</span></span>;
            })}
          </span>
        )}
      </button>
      <span className={styles.fieldHover} data-field-hover="" aria-hidden="true" hidden />
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
