"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "@/components/admin/icons";
import type { StatsField, StatsFieldGroup, StatsPlayer, StatsValue } from "./types";
import { STATS_POSITIONS } from "./types";
import styles from "./stats-workspace.module.css";

export type StatsWorkspaceProps = {
  players: StatsPlayer[];
  values: Record<string, object>;
  dirtyPlayerIds?: ReadonlySet<string>;
  groupsForPlayer: (player: StatsPlayer) => StatsFieldGroup[];
  onChange: (playerId: string, field: string, value: StatsValue) => void;
  positionGroupIdPrefix: string;
  contextLabel: string;
  description: string;
  disabled?: boolean;
  selectedPlayerId?: string | null;
  showPlayerDetail?: boolean;
  onShowPlayerDetailChange?: (show: boolean) => void;
  onSelectedPlayerChange?: (id: string) => void;
};

/** Selection and filtering only change the view; drafts remain owned by the page. */
export function StatsWorkspace({ players, values, dirtyPlayerIds, groupsForPlayer, onChange, positionGroupIdPrefix, contextLabel, description, disabled = false, selectedPlayerId, onSelectedPlayerChange, showPlayerDetail, onShowPlayerDetailChange }: StatsWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localShowDetail, setLocalShowDetail] = useState(Boolean(selectedPlayerId));
  const showDetail = showPlayerDetail ?? localShowDetail;
  const setShowDetail = onShowPlayerDetailChange ?? setLocalShowDetail;
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const searchId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const fields = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const selected = players.find(player => player.id === (selectedPlayerId === undefined ? selectedId : selectedPlayerId)) ?? players[0];
  const matching = players.filter(player => `${player.name} ${player.number} ${player.position}`.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const viewport = window.visualViewport;
    let frame: number | undefined;
    const update = () => {
      element.style.setProperty("--stats-visible-height", `${viewport?.height || innerHeight}px`);
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const scrollport = fields.current, focused = document.activeElement;
        if (!scrollport || !(focused instanceof HTMLElement) || !scrollport.contains(focused)) return;
        const bounds = scrollport.getBoundingClientRect(), field = focused.getBoundingClientRect();
        const mobile = window.matchMedia("(max-width:900px)").matches;
        const actions = document.querySelector<HTMLElement>("[data-stats-actions]")?.getBoundingClientRect();
        const shellBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        const visibleTop = (mobile ? Math.max(viewport?.offsetTop || 0, shellBottom) : Math.max(bounds.top, viewport?.offsetTop || 0)) + 8;
        const visibleBottom = Math.min(mobile ? Infinity : bounds.bottom, actions?.top ?? (viewport?.offsetTop || 0) + (viewport?.height || innerHeight)) - 8;
        if (visibleBottom <= visibleTop) return;
        const delta = field.top < visibleTop ? field.top - visibleTop : field.bottom > visibleBottom ? field.bottom - visibleBottom : 0;
        if (!delta) return;
        if (mobile) window.scrollBy({ top: delta, behavior: "instant" });
        else scrollport.scrollTop += delta;
      });
    };
    update();
    viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    element.addEventListener("focusin", update);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update); element.removeEventListener("focusin", update);
    };
  }, []);

  function selectPlayer(id: string) {
    if (onSelectedPlayerChange) onSelectedPlayerChange(id);
    else setSelectedId(id);
    setShowDetail(true);
    if (fields.current) fields.current.scrollTop = 0;
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width:900px)").matches) root.current?.querySelector<HTMLElement>("[data-stats-detail]")?.scrollIntoView({ block: "start", behavior: "instant" });
      heading.current?.focus({ preventScroll: true });
    });
  }

  return <div ref={root} className={styles.workspace} data-detail={showDetail}>
    <aside className={styles.roster} aria-label="Players">
      <div className={styles.listHeading}><h2>Players <span>{players.length}</span></h2>
        <label className="sr-only" htmlFor={searchId}>Search players</label>
        <input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a player" className={styles.search} />
      </div>
      <div className={styles.playerList}>
        {!matching.length && <p className={styles.empty}>No matching players. Try a name or shirt number.</p>}
        {STATS_POSITIONS.map(position => {
          const group = matching.filter(player => player.position === position);
          if (!group.length) return null;
          const dirtyCount = group.filter(player => dirtyPlayerIds?.has(player.id)).length;
          const open = !closed.has(position), id = `${positionGroupIdPrefix}-${position.toLowerCase()}`;
          return <div key={position}>
            <button type="button" className={styles.position} aria-expanded={open} aria-controls={id} onClick={() => setClosed(previous => {
              const next = new Set(previous); if (next.has(position)) next.delete(position); else next.add(position); return next;
            })}><span>{position}s <span className={styles.count}>{group.length}</span>{dirtyCount > 0 && <span className={styles.groupDirty}>{dirtyCount} unsaved</span>}</span><ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none" }} /></button>
            <div id={id} hidden={!open} inert={!open} aria-hidden={!open}>
              {group.map(player => <button key={player.id} type="button" className={styles.player} aria-label={`Select ${player.name}`} aria-pressed={selected?.id === player.id} onClick={() => selectPlayer(player.id)}>
                <span className={styles.number} aria-hidden="true">{player.number}</span><span className={styles.playerCopy}><strong>{player.name}</strong><small>{player.position}</small></span>
                {dirtyPlayerIds?.has(player.id) && <span className={styles.dirtyDot} role="img" aria-label="Has unsaved changes" />}
                <span aria-hidden="true" className={styles.chevron}>›</span>
              </button>)}
            </div>
          </div>;
        })}
      </div>
    </aside>
    {selected && <section className={styles.detail} data-stats-detail aria-label="Selected player stats">
      <button type="button" className={styles.back} aria-label="All players" onClick={() => { setShowDetail(false); requestAnimationFrame(() => { root.current?.querySelector<HTMLElement>("aside")?.scrollIntoView({ block: "start", behavior: "instant" }); document.getElementById(searchId)?.focus({ preventScroll: true }); }); }}>‹ All players</button>
      <div className={styles.surface}>
        <div className={styles.playerHeading}><span className={styles.heroNumber} aria-hidden="true">{selected.number}</span><div><h2 ref={heading} tabIndex={-1}>{selected.name}</h2><p>{selected.position} · {contextLabel}</p></div></div>
        <p className={styles.caption}>{description}</p>
        <div className={styles.fields} ref={fields}>
          {groupsForPlayer(selected).map(group => <fieldset key={group.id} className={styles.fieldGroup} disabled={disabled}><legend>{group.label}</legend><div className={styles.fieldGrid}>
            {group.fields.map(field => <StatsFieldControl key={field.key} player={selected} field={field} value={(values[selected.id] as Record<string, StatsValue> | undefined)?.[field.key] ?? (field.kind === "boolean" ? false : 0)} onChange={value => onChange(selected.id, field.key, value)} disabled={disabled} />)}
          </div></fieldset>)}
        </div>
      </div>
    </section>}
  </div>;
}

function StatsFieldControl({ player, field, value, onChange, disabled }: { player: StatsPlayer; field: StatsField; value: StatsValue; onChange: (value: StatsValue) => void; disabled: boolean }) {
  const id = useId(), ariaLabel = `${player.name}: ${field.ariaLabel}`;
  const boundedNumber = (next: number) => Math.min(field.max ?? Infinity, Math.max(0, next));
  return <div className={styles.field}>
    <div className={styles.fieldCopy}><label htmlFor={id}>{field.label}</label>{field.hint && <small>{field.hint}</small>}</div>
    {field.kind === "boolean" ? <label className={styles.switchControl}><input id={id} type="checkbox" aria-label={ariaLabel} checked={Boolean(value)} onChange={event => onChange(event.target.checked)} disabled={disabled} className={styles.switchInput} /><span className={styles.switchTrack} aria-hidden="true" /></label> : <div className={styles.stepper}>
      <button type="button" aria-label={`Decrease ${ariaLabel}`} disabled={disabled || Number(value) <= 0} onClick={() => onChange(boundedNumber(Number(value) - 1))}>−</button>
      <input id={id} type="number" data-slot="stat-input" inputMode="numeric" min={0} max={field.max} step={1} aria-label={ariaLabel} value={Number(value)} disabled={disabled} onChange={event => onChange(boundedNumber(Number(event.target.value)))} />
      <button type="button" aria-label={`Increase ${ariaLabel}`} disabled={disabled || Number(value) >= (field.max ?? Infinity)} onClick={() => onChange(boundedNumber(Number(value) + 1))}>+</button>
    </div>}
  </div>;
}
