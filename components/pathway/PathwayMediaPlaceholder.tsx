import type { PathwayTone } from "@/components/pathway/PathwaySection";

/**
 * Neutral media placeholder for the pathway@1 template (MLA P1 Step 5).
 *
 * Phase 1 ships no club photography, so every media slot in a pathway
 * section renders this instead: a flat neutral fill with a faint diagonal
 * hatch and, optionally, a small honest caption saying what the slot is for.
 * It deliberately fabricates nothing — no stock imagery, no illustrated
 * stand-ins, no invented crests. When real assets are supplied the callers
 * swap this for the platform's normal <ResilientImage> delivery.
 *
 * The block itself is decorative (aria-hidden); only the caption, when a
 * caller supplies one, is exposed to assistive technology.
 */

export type PathwayMediaRatio = "portrait" | "landscape" | "square";

export type PathwayMediaPlaceholderProps = {
  /** Short, honest description of the missing asset, e.g. "Team photography to come". */
  caption?: string;
  ratio?: PathwayMediaRatio;
  tone?: PathwayTone;
  className?: string;
};

export default function PathwayMediaPlaceholder({
  caption,
  ratio = "landscape",
  tone = "light",
  className,
}: PathwayMediaPlaceholderProps) {
  return (
    <figure
      className={["pathway-media", className].filter(Boolean).join(" ")}
      data-ratio={ratio}
      data-tone={tone}
    >
      <div className="pathway-media-fill" aria-hidden="true" />
      {caption && <figcaption className="pathway-media-caption">{caption}</figcaption>}
    </figure>
  );
}
