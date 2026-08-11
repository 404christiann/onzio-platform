import { cn } from "@/lib/utils";

/**
 * Shared admin-portal loading indicator.
 *
 * Single source of truth for every loading affordance in `/admin`, replacing
 * the previous mix of plain-text "Loading…" paragraphs and lucide `Loader`
 * icons spun with `animate-spin`. Two modes:
 *
 * - `<AdminLoading />`      — full text loader ("Loading" + three bouncing
 *                             dots), for page/section-level loading states.
 * - `<AdminLoadingDots />`  — compact dots only, sized to sit inside a button
 *                             next to a "Saving…" label.
 *
 * The bounce comes from the top-level `@keyframes spinner-ellipsis` in
 * `styles/globals.css`, referenced through Tailwind arbitrary `animate-[...]`
 * utilities — the same pattern the AdminSaveFeedback keyframes use. No
 * component here ever injects an inline `<style>` tag.
 */

/** Color variants. `brand` resolves to the shared `--brand` token (#0eb547),
 *  so the brand accent only ever has to change in one place. */
export type AdminLoadingTone = "default" | "brand";

const TONE_CLASS: Record<AdminLoadingTone, string> = {
  default: "text-foreground",
  brand: "text-brand",
};

/** Staggered starts so the three dots ripple rather than bounce in unison. */
const DOT_ANIMATIONS = [
  "[animation:spinner-ellipsis_1s_ease-in-out_infinite_0s]",
  "[animation:spinner-ellipsis_1s_ease-in-out_infinite_0.12s]",
  "[animation:spinner-ellipsis_1s_ease-in-out_infinite_0.24s]",
] as const;

type AdminLoadingDotsProps = {
  /** Omit to inherit the surrounding text color (the usual case inside a
   *  button, whose own variant already sets a foreground color). */
  tone?: AdminLoadingTone;
  className?: string;
};

/**
 * Compact inline variant: three animated dots and nothing else. Purely
 * decorative — the surrounding control supplies the accessible status text
 * (e.g. a button label that flips to "Saving…"), so this is `aria-hidden`.
 */
export function AdminLoadingDots({ tone, className }: AdminLoadingDotsProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-end gap-px pb-px align-baseline leading-none",
        tone ? TONE_CLASS[tone] : undefined,
        className,
      )}
    >
      {DOT_ANIMATIONS.map((animation, index) => (
        <span key={index} className={cn("inline-block", animation)}>
          .
        </span>
      ))}
    </span>
  );
}

type AdminLoadingProps = {
  /** Visible word(s) before the dots. Pages pass their own copy (e.g.
   *  "Loading programs") so the message stays specific to the surface. */
  label?: string;
  tone?: AdminLoadingTone;
  /** Extra classes for typography/layout. Color comes from `tone`. */
  className?: string;
};

/**
 * Text loader: "Loading" followed by three bouncing dots.
 */
export default function AdminLoading({
  label = "Loading",
  tone = "default",
  className,
}: AdminLoadingProps) {
  return (
    <div
      className={cn("inline-flex", TONE_CLASS[tone], className)}
      role="status"
      aria-label="loading"
    >
      <span className="flex h-6 items-end justify-center" aria-hidden="true">
        <span className="pb-px">{label}</span>
        <AdminLoadingDots className="ms-0.5" />
      </span>
      <span className="sr-only">{label}...</span>
    </div>
  );
}
