"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { IconCaretDown as AdminSelectChevron } from "@/components/admin/icons";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { editTargetProps } from "@/lib/admin-edit-targets";
import type { DBSeason } from "@/lib/db-types";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";
import { cn } from "@/lib/utils";
import LeagueLogoUpload from "@/components/admin/schedule/LeagueLogoUpload";
import MatchSummaryFields from "@/components/admin/schedule/MatchSummaryFields";
import { Field, OpponentLogoUpload, SponsorLogoUpload } from "@/components/admin/schedule/ScheduleMatchForm";
import { MAX_MATCH_SCORE, deleteUnusedMatchImageUrls, type FormState } from "@/components/admin/schedule/schedule-model";
import { matchTarget, type MatchField } from "./match-edit-targets";
import type { MatchSectionId } from "./rose-city-schedule-model";
import styles from "./RoseCityScheduleEditor.module.css";
import { LINK_DESTINATION_HINT } from "@/lib/link-destination";

const input = cn(ADMIN_INPUT_CLASS, "min-h-11");

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className={styles.group}>
      <legend>{title}</legend>
      {description && <p className={styles.groupHint}>{description}</p>}
      {children}
    </fieldset>
  );
}

export type MatchFieldsProps = {
  section: MatchSectionId;
  /** The match's key (its id, or `new:N`): the row every control's click-to-field id is keyed by. */
  matchKey: string;
  form: FormState;
  onChange: Dispatch<SetStateAction<FormState>>;
  seasons: DBSeason[];
  clubName: string;
  /** A match not saved yet: a replaced upload is deleted at once, as the classic editor does for a new match. */
  isNew: boolean;
  onUploadBusyChange: (delta: number) => void;
  onMediaActivity: () => void;
  /** Saved matches only. Deleting stays an immediate, confirmed action. */
  onDelete?: () => void;
};

/** The fields of one section of the match dialog. Same fields, labels, limits and help words as the classic match form. */
export function RoseCityMatchFields({ section, matchKey, form, onChange, seasons, clubName, isNew, onUploadBusyChange, onMediaActivity, onDelete }: MatchFieldsProps) {
  const target = (field: MatchField) => editTargetProps(matchTarget(matchKey, field));
  const set = (field: string, value: string | boolean | number | null) => onChange(current => ({ ...current, [field]: value }));
  const setScore = (field: "rose_city_score" | "opponent_score", value: string) => set(field, value === "" ? null : Number(value));
  const cleanup = (bucket: string, column: "opponent_logo_url" | "sponsor_logo_url" | "league_logo_url", url: string | null, prefix: string) =>
    isNew ? deleteUnusedMatchImageUrls({ bucket, urls: [url], column, allowedPrefixes: [prefix] }) : Promise.resolve();

  if (section === "match") {
    return (
      <div className={styles.fields}>
        <Group title="Match details" description="Required fields are marked with *.">
          <div className={styles.row2}>
            <Field id="match-season" label="Season" required>
              <NativeSelect chevronIcon={AdminSelectChevron} id="match-season" {...target("season")} value={form.season_id} onChange={e => set("season_id", e.target.value)} className="min-h-11" required>
                <NativeSelectOption value="">Select a season</NativeSelectOption>
                {seasons.map(season => <NativeSelectOption key={season.id} value={season.id}>{season.label}{season.active ? " (Active)" : ""}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field id="match-home-away" label="Home or away" required>
              <NativeSelect chevronIcon={AdminSelectChevron} id="match-home-away" {...target("homeAway")} value={form.home ? "home" : "away"} onChange={e => set("home", e.target.value === "home")} className="min-h-11" required>
                <NativeSelectOption value="home">Home</NativeSelectOption>
                <NativeSelectOption value="away">Away</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field id="match-date" label="Date" required>
              <input id="match-date" {...target("date")} type="date" value={form.date} onChange={e => set("date", e.target.value)} className={cn(input, "min-w-0 max-w-full box-border")} required />
            </Field>
            <Field id="match-time" label="Time" required>
              <input id="match-time" {...target("time")} type="time" value={form.time} onChange={e => set("time", e.target.value)} className={cn(input, "min-w-0 max-w-full box-border appearance-none")} required />
            </Field>
          </div>
          <Field id="match-competition" label="Competition" optional>
            <input id="match-competition" {...target("competition")} type="text" placeholder="e.g. UPSL Premier Division" value={form.competition ?? ""} onChange={e => set("competition", e.target.value)} maxLength={MATCH_TEXT_LIMITS.competition} className={input} />
          </Field>
          <Field id="match-league-logo" label="League logo" optional>
            <div className={styles.leagueLogo}>
              <div {...target("leagueLogo")}><LeagueLogoUpload
                inputId="match-league-logo" logoUrl={form.league_logo_url} leagueName={form.competition ?? ""}
                onUploaded={async url => { await cleanup("league-logos", "league_logo_url", form.league_logo_url, "match-leagues/"); onChange(current => ({ ...current, league_logo_url: url })); }}
                onRemove={async () => { await cleanup("league-logos", "league_logo_url", form.league_logo_url, "match-leagues/"); onChange(current => ({ ...current, league_logo_url: null })); }}
              /></div>
            </div>
          </Field>
        </Group>
        <Group title="Opponent">
          <div className={styles.row2}>
            <Field id="match-opponent" label="Opponent name" required>
              <input id="match-opponent" {...target("opponent")} type="text" placeholder="e.g. Portland FC" value={form.opponent} onChange={e => set("opponent", e.target.value)} maxLength={MATCH_TEXT_LIMITS.opponent} className={input} required />
            </Field>
            <Field id="match-opponent-short-name" label="Short name" optional help="Use only when the full name is too long for the homepage card.">
              <input id="match-opponent-short-name" {...target("opponentShortName")} type="text" placeholder="e.g. Portland" value={form.opponent_short_name ?? ""} onChange={e => set("opponent_short_name", e.target.value)} maxLength={MATCH_TEXT_LIMITS.opponent_short_name} aria-describedby="match-opponent-short-name-help" className={input} />
            </Field>
          </div>
          <div {...target("opponentLogo")}><OpponentLogoUpload
            inputId="match-opponent-logo" onUploadBusyChange={onUploadBusyChange} onMediaActivity={onMediaActivity}
            logoUrl={form.opponent_logo_url} opponentName={form.opponent}
            onUploaded={async url => { await cleanup("opponent-logos", "opponent_logo_url", form.opponent_logo_url, "match-opponents/"); onChange(current => ({ ...current, opponent_logo_url: url })); }}
            onRemove={async () => { await cleanup("opponent-logos", "opponent_logo_url", form.opponent_logo_url, "match-opponents/"); onChange(current => ({ ...current, opponent_logo_url: null })); }}
          /></div>
        </Group>
        <Group title="Venue">
          <Field id="match-venue" label="Venue name" required>
            <input id="match-venue" {...target("venue")} type="text" placeholder="e.g. Delta Park" value={form.venue} onChange={e => set("venue", e.target.value)} maxLength={MATCH_TEXT_LIMITS.venue} className={input} required />
          </Field>
          <Field id="match-address" label="Address for directions" optional help="Visitors tap Directions on the Schedule to get Google Maps directions to this address. Type the full street address with the city. Leave it blank to hide Directions.">
            <input id="match-address" {...target("address")} type="text" placeholder="e.g. 1570 E Colorado Blvd, Pasadena, CA 91106" value={form.address ?? ""} onChange={e => set("address", e.target.value)} maxLength={MATCH_TEXT_LIMITS.address} aria-describedby="match-address-help" className={input} />
          </Field>
          <div className={styles.rowCity}>
            <Field id="match-city" label="City" optional>
              <input id="match-city" {...target("city")} type="text" placeholder="e.g. Irvine" value={form.city ?? ""} onChange={e => set("city", e.target.value)} maxLength={MATCH_TEXT_LIMITS.city} className={input} />
            </Field>
            <Field id="match-state" label="State" optional>
              <input id="match-state" {...target("state")} type="text" placeholder="e.g. CA" value={form.state ?? ""} onChange={e => set("state", e.target.value)} maxLength={MATCH_TEXT_LIMITS.state} className={input} />
            </Field>
          </div>
        </Group>
        {onDelete && (
          <div className={styles.danger}>
            <Button type="button" variant="outline" className="min-h-11 text-destructive" onClick={onDelete}>Delete match</Button>
            <p>Removes the match from the Schedule right away, with the stats entered for it. It does not wait for Save.</p>
          </div>
        )}
      </div>
    );
  }

  if (section === "result") {
    return (
      <div className={styles.fields}>
        <Group title="Result" description="Leave both scores blank until the match is played.">
          <div className={styles.row2}>
            <Field id="match-club-score" label={`${clubName} score`} optional>
              <input id="match-club-score" {...target("clubScore")} type="number" min="0" step="1" inputMode="numeric" placeholder="e.g. 2" value={String(form.rose_city_score ?? "")} onChange={e => setScore("rose_city_score", e.target.value)} max={MAX_MATCH_SCORE} className={input} />
            </Field>
            <Field id="match-opponent-score" label="Opponent score" optional>
              <input id="match-opponent-score" {...target("opponentScore")} type="number" min="0" step="1" inputMode="numeric" placeholder="e.g. 1" value={String(form.opponent_score ?? "")} onChange={e => setScore("opponent_score", e.target.value)} max={MAX_MATCH_SCORE} className={input} />
            </Field>
          </div>
        </Group>
        <Group title="Stream and replay">
          <Field id="match-replay-video" label="Stream or replay video (YouTube link)" optional help="Before kickoff, paste the livestream link; YouTube keeps the same link for the replay. It shows on the Schedule, the homepage and this match’s summary. Left blank, the Schedule shows the Watch on YouTube logo without a link and the match summary says “coming soon”.">
            <input id="match-replay-video" {...target("replayVideo")} type="url" inputMode="url" placeholder="e.g. https://youtu.be/…" value={form.replay_video_url ?? ""} onChange={e => set("replay_video_url", e.target.value)} aria-describedby="match-replay-video-help" className={input} />
          </Field>
        </Group>
        <Group title="Attendance">
          <Field id="match-attendance" label="Attendance" optional>
            <input id="match-attendance" {...target("attendance")} type="number" min="0" step="1" inputMode="numeric" placeholder="e.g. 1356" value={String(form.attendance ?? "")} onChange={e => set("attendance", e.target.value === "" ? null : Number(e.target.value))} className={input} />
          </Field>
        </Group>
      </div>
    );
  }

  if (section === "summary") {
    return (
      <div className={styles.fields}>
        <p className={styles.groupHint}>Optional. Fill in what you have after the match; anything left empty is hidden on the Match Summary page.</p>
        <MatchSummaryFields matchKey={matchKey} value={form.summary} clubLabel={clubName} opponentLabel={form.opponent || "Opponent"} onChange={summary => onChange(current => ({ ...current, summary }))} />
      </div>
    );
  }

  return (
    <div className={styles.fields}>
      <Group title="Presented by" description="New matches reuse the latest sponsor details. Clear the logo to hide the sponsor on the homepage.">
        <div className={styles.row2}>
          <Field id="match-sponsor-name" label="Sponsor name" optional>
            <input id="match-sponsor-name" {...target("name")} type="text" placeholder="e.g. Tepito Coffee" value={form.sponsor_name ?? ""} onChange={e => set("sponsor_name", e.target.value)} className={input} />
          </Field>
          <Field id="match-sponsor-link" label="Sponsor website" optional help={LINK_DESTINATION_HINT}>
            <input id="match-sponsor-link" {...target("link")} type="text" value={form.sponsor_link ?? ""} onChange={e => set("sponsor_link", e.target.value)} className={input} />
          </Field>
        </div>
        <div {...target("logo")}><SponsorLogoUpload
          inputId="match-sponsor-logo" onUploadBusyChange={onUploadBusyChange} onMediaActivity={onMediaActivity}
          logoUrl={form.sponsor_logo_url} sponsorName={form.sponsor_name ?? ""}
          onUploaded={async url => { await cleanup("sponsors", "sponsor_logo_url", form.sponsor_logo_url, "match-sponsors/"); onChange(current => ({ ...current, sponsor_logo_url: url })); }}
          onRemove={async () => { await cleanup("sponsors", "sponsor_logo_url", form.sponsor_logo_url, "match-sponsors/"); onChange(current => ({ ...current, sponsor_logo_url: null })); }}
        /></div>
      </Group>
    </div>
  );
}
