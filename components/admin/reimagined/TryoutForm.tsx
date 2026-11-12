"use client";

import { useState } from "react";
import { IconCaretLeft, IconLink, IconMail, IconRegistrations } from "@/components/admin/icons";
import { Spinner } from "@/components/ui/spinner";
import type { SignUpFormOption, TryoutItem } from "@/lib/admin-programs-tryouts-data";
import { tryoutDay } from "@/lib/admin-programs-tryouts-data";
import { PROGRAMS_TRYOUTS_MESSAGES, TRYOUT_LIMITS } from "@/lib/programs-tryouts-contract";
import { FormPicker, type ProgramsTryoutsLinks } from "./ProgramsTryouts";
import styles from "./programs-tryouts.module.css";

// ADMIN-RE-12c: add a tryout, or change one, as plain questions (design:
// cd-tryout-final; decisions 3, 7, 8, 12, 13). There is no status question:
// families can sign up as soon as a sign-up way is chosen, and it closes by
// itself the day after its date (decision 0003). With a sign-up form the price
// comes from the form; a cost note is asked only for a link or "They contact
// you" (decision 0004). A small card shows how the Tryouts page will read.

type Way = "form" | "link" | "contact" | "none";

export function TryoutForm({
  tryout,
  forms,
  places,
  hasContactEmail,
  today,
  savedText,
  title,
  links,
  onClose,
}: {
  tryout: TryoutItem | null;
  forms: readonly SignUpFormOption[];
  places: readonly string[];
  hasContactEmail: boolean;
  today: string;
  savedText: string;
  title: string;
  links: ProgramsTryoutsLinks;
  /** Back to the list; with the words for the saved note when something was saved. */
  onClose: (saved: string | null) => void;
}) {
  const [name, setName] = useState(tryout?.name ?? "");
  const [date, setDate] = useState(tryout?.eventDate ?? "");
  const [place, setPlace] = useState(tryout?.location ?? "");
  const [way, setWay] = useState<Way>(tryout ? (tryout.formId ? "form" : tryout.way === "none" ? "none" : tryout.way) : "none");
  const [formId, setFormId] = useState<string | null>(tryout?.formId ?? null);
  const [label, setLabel] = useState(tryout?.linkLabel || "Sign up");
  const [href, setHref] = useState(tryout?.linkHref ?? "");
  const [note, setNote] = useState(tryout?.costNote ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const form = forms.find((option) => option.id === formId) ?? null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? tryoutDay(date) : null;
  const pastDate = Boolean(day && date < today);
  const adding = tryout === null;
  const ready = name.trim().length > 0 && (way !== "form" || formId !== null) && (way !== "link" || (label.trim() && href.trim()));

  const note1 =
    way === "none"
      ? "Families can't sign up until you choose how."
      : adding
        ? "Families can sign up as soon as you add it."
        : "Families can sign up while it's open.";
  const note2 = day
    ? pastDate
      ? `Its date, ${day}, has passed, so it shows as closed.`
      : `It closes by itself after ${day}.`
    : "It closes by itself the day after its date.";
  const cost = way === "form" ? (form?.price ?? "TBA") : note.trim() || "TBA";

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    setProblem(null);
    const request = {
      action: "save-tryout" as const,
      operationId: crypto.randomUUID(),
      id: tryout?.id ?? null,
      expectedUpdatedAt: tryout?.updatedAt ?? null,
      tryout: {
        headline: name.trim(),
        event_date: day ? date : null,
        location: place.trim(),
        cost_text: way === "form" ? (tryout?.costNote ?? "") : note.trim(),
        cta_label: way === "link" ? label.trim() : "",
        registration_href: way === "link" ? href.trim() : "",
        registration_form_id: way === "form" ? formId : null,
        sign_up_by_contact: way === "contact",
        closed: tryout?.closedByOwner ?? false,
        hidden: tryout?.hidden ?? false,
        stays_open_after_date: tryout?.staysOpenAfterDate ?? false,
      },
    };
    try {
      const response = await fetch("/api/admin/programs-and-tryouts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: unknown } } | null;
      if (response.ok && body?.ok) {
        onClose(adding ? savedText.replace(/^Saved/, "Added") : savedText);
        return;
      }
      const message = body?.error?.message;
      setProblem(typeof message === "string" ? message : PROGRAMS_TRYOUTS_MESSAGES.DATABASE_OPERATION_FAILED);
    } catch {
      setProblem(PROGRAMS_TRYOUTS_MESSAGES.DATABASE_OPERATION_FAILED);
    }
    setSaving(false);
  }

  return (
    <div className={styles.page}>
      <button type="button" className={styles.back} onClick={() => onClose(null)}>
        <IconCaretLeft className={styles.icon} />
        {title}
      </button>
      <h1 className={styles.h1}>{adding ? "Add a tryout" : "Change the tryout"}</h1>

      <div className={styles.formGrid}>
        <form
          className={styles.questions}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className={styles.field}>
            <span>What is it called?</span>
            <input
              value={name}
              maxLength={TRYOUT_LIMITS.name}
              required
              placeholder="Spring tryouts"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>When?</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>

          <div className={styles.field}>
            <label htmlFor="tryout-place">Where?</label>
            <input
              id="tryout-place"
              value={place}
              maxLength={TRYOUT_LIMITS.place}
              placeholder="Riverside Fields"
              onChange={(event) => setPlace(event.target.value)}
            />
            {places.length > 0 ? (
              <span className={styles.chips}>
                <span className={styles.chipsLabel}>Last used</span>
                {places.map((option) => (
                  <button key={option} type="button" className={styles.chip} title={option} onClick={() => setPlace(option)}>
                    {option}
                  </button>
                ))}
              </span>
            ) : null}
          </div>

          <fieldset className={styles.ways}>
            <legend>How do families sign up?</legend>
            <WayCard value="form" current={way} onPick={setWay} icon={<IconRegistrations className={styles.icon} />}>
              Sign-up form
            </WayCard>
            <WayCard value="link" current={way} onPick={setWay} icon={<IconLink className={styles.icon} />}>
              A link to another site
            </WayCard>
            <WayCard value="contact" current={way} onPick={setWay} icon={<IconMail className={styles.icon} />}>
              They contact you
            </WayCard>
          </fieldset>

          {way === "form" ? (
            <FormPicker
              item={tryout}
              forms={forms}
              links={links}
              picked={formId}
              onPick={(id) => setFormId(id)}
            />
          ) : null}
          {way === "link" ? (
            <>
              <label className={styles.field}>
                <span>Button words</span>
                <input value={label} maxLength={TRYOUT_LIMITS.buttonLabel} required onChange={(event) => setLabel(event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Link</span>
                <input value={href} maxLength={2048} required inputMode="url" placeholder="https://" onChange={(event) => setHref(event.target.value)} />
              </label>
            </>
          ) : null}
          {way === "contact" && !hasContactEmail ? (
            <p className={styles.menuNote}>
              Add your email in Your club so the &ldquo;Contact the club&rdquo; button has somewhere to go.
            </p>
          ) : null}
          {way === "link" || way === "contact" ? (
            <label className={styles.field}>
              <span>Cost (optional)</span>
              <input value={note} maxLength={TRYOUT_LIMITS.costNote} placeholder="$25 at the field" onChange={(event) => setNote(event.target.value)} />
            </label>
          ) : null}

          <p className={styles.quiet}>
            {note1} {note2}
          </p>
          {problem ? (
            <p className={styles.notice} role="alert">
              {problem}
            </p>
          ) : null}
          <div className={styles.formButtons}>
            <button type="submit" className={styles.primary} disabled={!ready || saving}>
              {saving ? <Spinner className={styles.icon} /> : null}
              {saving ? (adding ? "Adding…" : "Saving…") : adding ? "Add tryout" : "Save"}
            </button>
          </div>
        </form>

        <aside className={styles.preview} aria-label="How the Tryouts page shows it">
          <span className={styles.previewLabel}>On your Tryouts page</span>
          <div className={styles.previewCard}>
            <strong className={styles.previewName}>{name.trim() || "Tryout"}</strong>
            <dl className={styles.previewFacts}>
              <div>
                <dt>Date</dt>
                <dd>{day ?? "TBA"}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{place.trim() || "TBA"}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{cost}</dd>
              </div>
            </dl>
            <span className={styles.previewButton} data-off={way === "none" || pastDate ? "" : undefined}>
              {way === "link" ? label.trim() || "Sign up" : way === "form" ? "Register now" : "Contact the club"}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WayCard({
  value,
  current,
  onPick,
  icon,
  children,
}: {
  value: Way;
  current: Way;
  onPick: (way: Way) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.wayCard} data-picked={current === value || undefined}>
      <input type="radio" name="sign-up-way" value={value} checked={current === value} onChange={() => onPick(value)} />
      {icon}
      <span>{children}</span>
    </label>
  );
}
