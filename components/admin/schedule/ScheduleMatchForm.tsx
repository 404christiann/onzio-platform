"use client";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import dialogStyles from "@/components/admin/ui/AdminDialog.module.css";
import { IconCaretDown as AdminSelectChevron, ChevronDownIcon, ChevronLeft, ChevronRight } from "@/components/admin/icons";
import { useClubContext } from "@/components/ClubContextProvider";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import type { DBSeason } from "@/lib/db-types";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";
import { cn } from "@/lib/utils";
import { ADMIN_INPUT_CLASS } from "@/components/admin/form-styles";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverPositioner, PopoverTrigger } from "@/components/ui/popover";
import { AdminImageField } from "@/components/admin/ui/AdminImageField";
import { adminImageRules } from "@/components/admin/ui/adminImageFiles";
import LeagueLogoUpload from "@/components/admin/schedule/LeagueLogoUpload";
import MatchSummaryFields from "@/components/admin/schedule/MatchSummaryFields";
import { MAX_MATCH_SCORE, parseDateInput, formatDateInput, uploadPhoto, logoUploadErrorMessage, deleteUnusedMatchImageUrls, type FormState } from "./schedule-model";

export function MatchForm({
  form,
  onChange,
  seasons,
  cleanupDraftUploads = false,
  onUploadBusyChange,
  onMediaActivity,
}: {
  form: FormState;
  onChange: Dispatch<SetStateAction<FormState>>;
  seasons: DBSeason[];
  cleanupDraftUploads?: boolean;
  onUploadBusyChange: (delta: number) => void;
  onMediaActivity: () => void;
}) {
  const club = useClubContext();
  // academy@1 renders fixtures through AcademyNextMatch and AcademyFixtureRow,
  // neither of which reads sponsor_name, sponsor_logo_url, or sponsor_link, so
  // anything entered here could never appear on this club's site. Same
  // dead-admin-surface removal as DCFC-D130. The columns, the upload/cleanup
  // logic, and every other template's editor are untouched — clubhouse@1 still
  // renders these through NextMatchCard.
  const schedulePolicy = codeSiteAdminFor(club)?.schedule;
  const hidesMatchSponsorFields = schedulePolicy?.showMatchSponsorFields === false;
  // ADMIN-RE-22: academy@1's Next Match card shows the game's own competition.
  const competitionOnNextMatch = schedulePolicy?.competitionShowsOnNextMatch === true;

  function set(field: string, value: string | boolean | number | null) {
    onChange((current) => ({ ...current, [field]: value }));
  }

  const [calendarContainer, setCalendarContainer] = useState<HTMLDivElement | null>(null);
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  function setScore(field: "rose_city_score" | "opponent_score", value: string) {
    set(field, value === "" ? null : Number(value));
  }

  return (
    <div ref={setCalendarContainer} className="relative space-y-8">
      <MatchFormSection
        id="match-details-heading"
        title="Match details"
        description="Required fields are marked with *."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="match-season" label="Season" required>
            <NativeSelect chevronIcon={AdminSelectChevron}
              id="match-season"
              value={form.season_id}
              onChange={(e) => set("season_id", e.target.value)}
              className="min-h-11"
              required
            >
              <NativeSelectOption value="">Select a season</NativeSelectOption>
              {seasons.map((season) => (
                <NativeSelectOption key={season.id} value={season.id}>
                  {season.label}{season.active ? " (Active)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field id="match-home-away" label="Home or away" required>
            <NativeSelect chevronIcon={AdminSelectChevron}
              id="match-home-away"
              value={form.home ? "home" : "away"}
              onChange={(e) => set("home", e.target.value === "home")}
              className="min-h-11"
              required
            >
              <NativeSelectOption value="home">Home</NativeSelectOption>
              <NativeSelectOption value="away">Away</NativeSelectOption>
            </NativeSelect>
          </Field>

          <Field id="match-date" label="Date" required>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger
                ref={dateTrigger}
                id="match-date"
                aria-required="true"
                render={<Button variant="outline" />}
                className="min-h-11 w-full justify-between font-normal"
              >
                {parseDateInput(form.date)?.toLocaleDateString() ?? "Select date"}
                <ChevronDownIcon className="size-4 opacity-50" />
              </PopoverTrigger>
              <PopoverPositioner align="start" portal={{ container: calendarContainer }}>
                <PopoverContent className="w-auto p-0" finalFocus={dateTrigger}>
                  <Calendar
                    components={{
                      Chevron: ({ className, orientation, ...props }) => {
                        const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDownIcon;
                        return <Icon className={cn("size-4", className)} {...props} />;
                      },
                    }}
                    mode="single"
                    selected={parseDateInput(form.date)}
                    captionLayout="dropdown"
                    onSelect={(date) => {
                      if (date) set("date", formatDateInput(date));
                      dateTrigger.current?.focus({ preventScroll: true });
                      setDatePickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </PopoverPositioner>
            </Popover>
          </Field>

          <Field id="match-time" label="Time" required>
            <input
              id="match-time"
              type="time"
              value={form.time}
              onChange={(e) => set("time", e.target.value)}
              className={cn(ADMIN_INPUT_CLASS, "min-h-11 min-w-0 max-w-full box-border appearance-none")}
              required
            />
          </Field>

          <Field
            id="match-competition"
            label="Competition"
            optional
            help={competitionOnNextMatch ? "Shows under VS on your homepage Next Match card. Leave it blank to show no competition." : undefined}
            className="sm:col-span-2"
          >
            <input
              id="match-competition"
              type="text"
              placeholder="e.g. UPSL Premier Division"
              value={form.competition ?? ""}
              onChange={(e) => set("competition", e.target.value)}
              maxLength={MATCH_TEXT_LIMITS.competition}
              className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
            />
          </Field>
          {club.presentationTemplateKey === "cinematic@2" && (
            <Field id="match-league-logo" label="League logo" optional className="sm:col-span-2">
              <LeagueLogoUpload
                inputId="match-league-logo"
                logoUrl={form.league_logo_url}
                leagueName={form.competition ?? ""}
                onUploaded={async (url) => {
                  if (cleanupDraftUploads) await deleteUnusedMatchImageUrls({
                    bucket: "league-logos", urls: [form.league_logo_url],
                    column: "league_logo_url", allowedPrefixes: ["match-leagues/"],
                  });
                  onChange((current) => ({ ...current, league_logo_url: url }));
                }}
                onRemove={async () => {
                  if (cleanupDraftUploads) await deleteUnusedMatchImageUrls({
                    bucket: "league-logos", urls: [form.league_logo_url],
                    column: "league_logo_url", allowedPrefixes: ["match-leagues/"],
                  });
                  onChange((current) => ({ ...current, league_logo_url: null }));
                }}
              />
            </Field>
          )}
        </div>
      </MatchFormSection>

      <MatchFormSection id="opponent-heading" title="Opponent">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="match-opponent" label="Opponent name" required>
            <input
              id="match-opponent"
              type="text"
              placeholder="e.g. Portland FC"
              value={form.opponent}
              onChange={(e) => set("opponent", e.target.value)}
              maxLength={MATCH_TEXT_LIMITS.opponent}
              className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              required
            />
          </Field>

          <Field
            id="match-opponent-short-name"
            label="Short name"
            optional
            help="Use only when the full name is too long for the homepage card."
          >
            <input
              id="match-opponent-short-name"
              type="text"
              placeholder="e.g. Portland"
              value={form.opponent_short_name ?? ""}
              onChange={(e) => set("opponent_short_name", e.target.value)}
              maxLength={MATCH_TEXT_LIMITS.opponent_short_name}
              aria-describedby="match-opponent-short-name-help"
              className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
            />
          </Field>

          <div className="sm:col-span-2">
            <OpponentLogoUpload
              inputId="match-opponent-logo"
              onUploadBusyChange={onUploadBusyChange}
              onMediaActivity={onMediaActivity}
              logoUrl={form.opponent_logo_url}
              opponentName={form.opponent}
              onUploaded={async (url) => {
                if (cleanupDraftUploads) {
                  await deleteUnusedMatchImageUrls({
                    bucket: "opponent-logos",
                    urls: [form.opponent_logo_url],
                    column: "opponent_logo_url",
                    allowedPrefixes: ["match-opponents/"],
                  });
                }
                onChange((current) => ({ ...current, opponent_logo_url: url }));
              }}
              onRemove={async () => {
                if (cleanupDraftUploads) {
                  await deleteUnusedMatchImageUrls({
                    bucket: "opponent-logos",
                    urls: [form.opponent_logo_url],
                    column: "opponent_logo_url",
                    allowedPrefixes: ["match-opponents/"],
                  });
                }
                onChange((current) => ({ ...current, opponent_logo_url: null }));
              }}
            />
          </div>
        </div>
      </MatchFormSection>

      <MatchFormSection id="venue-heading" title="Venue">
        <div className="space-y-4">
          <Field id="match-venue" label="Venue name" required>
            <input
              id="match-venue"
              type="text"
              placeholder="e.g. Delta Park"
              value={form.venue}
              onChange={(e) => set("venue", e.target.value)}
              maxLength={MATCH_TEXT_LIMITS.venue}
              className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              required
            />
          </Field>

          {club.presentationTemplateKey === "cinematic@2" ? (
            <Field
              id="match-address"
              label="Address for directions"
              optional
              help="Visitors tap Directions on the Schedule to get Google Maps directions to this address. Type the full street address with the city. Leave it blank to hide Directions."
            >
              <input
                id="match-address"
                type="text"
                placeholder="e.g. 1570 E Colorado Blvd, Pasadena, CA 91106"
                value={form.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
                maxLength={MATCH_TEXT_LIMITS.address}
                aria-describedby="match-address-help"
                className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              />
            </Field>
          ) : (
            <Field id="match-address" label="Street address" optional>
              <input
                id="match-address"
                type="text"
                placeholder="e.g. 1234 N Broadacre St"
                value={form.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
                maxLength={MATCH_TEXT_LIMITS.address}
                className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field id="match-city" label="City" optional>
              <input
                id="match-city"
                type="text"
                placeholder="e.g. Irvine"
                value={form.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
              maxLength={MATCH_TEXT_LIMITS.city}
                className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              />
            </Field>

            <Field id="match-state" label="State" optional>
              <input
                id="match-state"
                type="text"
                placeholder="e.g. CA"
                value={form.state ?? ""}
                onChange={(e) => set("state", e.target.value)}
              maxLength={MATCH_TEXT_LIMITS.state}
                className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              />
            </Field>
          </div>
        </div>
      </MatchFormSection>

      <MatchFormSection
        id="result-heading"
        title="Result"
        description="Leave both scores blank until the match is played."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="match-club-score" label={`${club.name} score`} optional>
            <input
              id="match-club-score"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="e.g. 2"
              value={String(form.rose_city_score ?? "")}
              onChange={(e) => setScore("rose_city_score", e.target.value)}
              max={MAX_MATCH_SCORE}
              className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
            />
          </Field>

          <Field id="match-opponent-score" label="Opponent score" optional>
            <input
              id="match-opponent-score"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="e.g. 1"
              value={String(form.opponent_score ?? "")}
              onChange={(e) => setScore("opponent_score", e.target.value)}
              max={MAX_MATCH_SCORE}
              className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
            />
          </Field>

          {club.presentationTemplateKey === "cinematic@2" && (
            <Field
              id="match-replay-video"
              label="Stream or replay video (YouTube link)"
              optional
              help="Before kickoff, paste the livestream link; YouTube keeps the same link for the replay. It shows on the Schedule, the homepage and this match’s summary. Left blank, the Schedule shows the Watch on YouTube logo without a link and the match summary says “coming soon”."
              className="sm:col-span-2"
            >
              <input
                id="match-replay-video"
                type="url"
                inputMode="url"
                placeholder="e.g. https://youtu.be/…"
                value={form.replay_video_url ?? ""}
                onChange={(e) => set("replay_video_url", e.target.value)}
                aria-describedby="match-replay-video-help"
                className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              />
            </Field>
          )}
        </div>
      </MatchFormSection>

      {club.presentationTemplateKey === "cinematic@2" && (
        <MatchFormSection
          id="summary-heading"
          title="Match summary"
          description="Optional. Fill in what you have after the match; anything left empty is hidden on the Match Summary page."
        >
          <Field id="match-attendance" label="Attendance" optional>
            <input
              id="match-attendance"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="e.g. 1356"
              value={String(form.attendance ?? "")}
              onChange={(e) => set("attendance", e.target.value === "" ? null : Number(e.target.value))}
              className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
            />
          </Field>
          <MatchSummaryFields value={form.summary} clubLabel={club.name} opponentLabel={form.opponent || "Opponent"} onChange={(summary) => onChange((current) => ({ ...current, summary }))} />
        </MatchFormSection>
      )}

      {/* Academy fixture cards do not show sponsor columns. */}
      {!hidesMatchSponsorFields && (
        <MatchFormSection
          id="sponsor-heading"
          title="Presented by"
          description="New matches reuse the latest sponsor details. Clear the logo to hide the sponsor on the homepage."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="match-sponsor-name" label="Sponsor name" optional>
              <input
                id="match-sponsor-name"
                type="text"
                placeholder="e.g. Tepito Coffee"
                value={form.sponsor_name ?? ""}
                onChange={(e) => set("sponsor_name", e.target.value)}
                className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              />
            </Field>

            <Field id="match-sponsor-link" label="Sponsor website" optional>
              <input
                id="match-sponsor-link"
                type="url"
                placeholder="https://..."
                value={form.sponsor_link ?? ""}
                onChange={(e) => set("sponsor_link", e.target.value)}
                className={cn(ADMIN_INPUT_CLASS, "min-h-11")}
              />
            </Field>

            <div className="sm:col-span-2">
              <SponsorLogoUpload
                inputId="match-sponsor-logo"
                onUploadBusyChange={onUploadBusyChange}
              onMediaActivity={onMediaActivity}
                logoUrl={form.sponsor_logo_url}
                sponsorName={form.sponsor_name ?? ""}
                onUploaded={async (url) => {
                  if (cleanupDraftUploads) {
                    await deleteUnusedMatchImageUrls({
                      bucket: "sponsors",
                      urls: [form.sponsor_logo_url],
                      column: "sponsor_logo_url",
                      allowedPrefixes: ["match-sponsors/"],
                    });
                  }
                  onChange((current) => ({ ...current, sponsor_logo_url: url }));
                }}
                onRemove={async () => {
                  if (cleanupDraftUploads) {
                    await deleteUnusedMatchImageUrls({
                      bucket: "sponsors",
                      urls: [form.sponsor_logo_url],
                      column: "sponsor_logo_url",
                      allowedPrefixes: ["match-sponsors/"],
                    });
                  }
                  onChange((current) => ({ ...current, sponsor_logo_url: null }));
                }}
              />
            </div>
          </div>
        </MatchFormSection>
      )}
    </div>
  );
}

export function OpponentLogoUpload(props: LogoUploadProps & { opponentName: string }) {
  return <MatchLogoUpload {...props} label="Opponent logo" name={props.opponentName} bucket="opponent-logos" folder="match-opponents" />;
}

export function SponsorLogoUpload(props: LogoUploadProps & { sponsorName: string }) {
  return <MatchLogoUpload {...props} label="Sponsor logo" name={props.sponsorName} bucket="sponsors" folder="match-sponsors" />;
}

type LogoUploadProps = {
  inputId: string;
  logoUrl: string | null;
  onUploaded: (url: string) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
  onUploadBusyChange: (delta: number) => void;
  onMediaActivity: () => void;
};

function MatchLogoUpload({ inputId, logoUrl, onUploaded, onRemove, onUploadBusyChange, onMediaActivity, label, name, bucket, folder }: LogoUploadProps & { label: string; name: string; bucket: string; folder: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div id={inputId} onClickCapture={onMediaActivity} onChangeCapture={onMediaActivity}
      onDragEnterCapture={onMediaActivity} onDropCapture={onMediaActivity} className="[&_[data-admin-image-preview]_img]:object-contain [&_[data-admin-image-preview]_img]:p-[3px]">
      <AdminImageField label={label} previewUrl={logoUrl} initials={name.trim().slice(0, 2).toUpperCase() || "?"}
        size={64} shape={bucket === "opponent-logos" ? "circle" : "square"}
        {...adminImageRules("graphic")}
        onPendingChange={(pending) => onUploadBusyChange(pending ? 1 : -1)}
        onUpload={async (files) => {
          setError(null);
          try {
            await onUploaded(await uploadPhoto(files[0], bucket, folder));
            return true;
          } catch (uploadError) {
            setError(logoUploadErrorMessage(uploadError));
            return false;
          }
        }}
        onRemove={() => {
          onUploadBusyChange(1);
          void Promise.resolve(onRemove()).catch((removeError) => setError(logoUploadErrorMessage(removeError))).finally(() => onUploadBusyChange(-1));
        }}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function Field({
  id,
  label,
  required,
  optional,
  help,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block font-body text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
        {optional && <span className="ml-1.5 font-normal text-muted-foreground">Optional</span>}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="mt-1.5 font-body text-sm leading-relaxed text-muted-foreground">
          {help}
        </p>
      )}
    </div>
  );
}

function MatchFormSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={dialogStyles.section} data-slot="admin-dialog-section" aria-labelledby={id}>
      <h3 id={id} className={dialogStyles.sectionTitle}>{title}</h3>
      {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}
