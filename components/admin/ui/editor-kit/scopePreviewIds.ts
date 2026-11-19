/** Attributes holding space-separated id tokens: the aria IDREF set and a label's `for`. */
const TOKEN_ATTRS = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-details", "aria-activedescendant", "aria-errormessage", "aria-flowto", "for"] as const;
/** SVG presentation attributes that can hold `url(#id)`; `style` can hold it too. */
const URL_ATTRS = ["fill", "stroke", "clip-path", "mask", "filter", "marker-start", "marker-mid", "marker-end", "style"] as const;
/** Attributes holding a `#id` fragment (`<a>`, `<use>`, gradients). */
const HREF_ATTRS = ["href", "xlink:href"] as const;

/** Every attribute scopePreviewIds reads or writes, plus `id`. PreviewCards' MutationObserver watches exactly this list, so the two cannot drift apart. */
export const SCOPED_PREVIEW_ATTRIBUTES: string[] = ["id", ...TOKEN_ATTRS, ...URL_ATTRS, ...HREF_ATTRS];

const URL_REF = /url\(\s*(["']?)#([^)"'\s]+)\1\s*\)/g;

/**
 * Makes every `id` inside one inline preview unique by prefixing it, and rewrites the references that point at
 * those ids inside the same subtree (aria-labelledby, aria-describedby, aria-controls, aria-owns, aria-details,
 * aria-activedescendant, aria-errormessage, aria-flowto, label `for`, `href`/`xlink:href="#…"` and SVG `url(#…)`
 * in fill, stroke, clip-path, mask, filter, markers and `style`). The public components hardcode their ids, and PreviewCards
 * renders one of them per card, so without this the admin page repeats `robinson-title`, `perks-title` and so on.
 * Idempotent: ids and references that already carry the prefix are left alone, so it is safe to run again after
 * React re-renders part of the subtree. It changes no layout (ids carry no style).
 */
export function scopePreviewIds(root: Element, prefix: string): void {
  const withId = Array.from(root.querySelectorAll("[id]"));
  const raw = new Set<string>();
  const scoped = new Set<string>();
  for (const el of withId) {
    if (el.id.startsWith(prefix)) scoped.add(el.id);
    else raw.add(el.id);
  }
  const rewrite = (token: string) => (token.startsWith(prefix) || !(raw.has(token) || scoped.has(prefix + token)) ? token : prefix + token);
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const name of TOKEN_ATTRS) {
      const value = el.getAttribute(name);
      if (!value) continue;
      const next = value.split(/\s+/).filter(Boolean).map(rewrite).join(" ");
      if (next !== value) el.setAttribute(name, next);
    }
    for (const name of HREF_ATTRS) {
      const href = el.getAttribute(name);
      if (href && href.startsWith("#") && href.length > 1) {
        const target = rewrite(href.slice(1));
        if (target !== href.slice(1)) el.setAttribute(name, `#${target}`);
      }
    }
    for (const name of URL_ATTRS) {
      const value = el.getAttribute(name);
      if (!value || !value.includes("url(")) continue;
      const next = value.replace(URL_REF, (whole, quote: string, id: string) => {
        const target = rewrite(id);
        return target === id ? whole : `url(${quote}#${target}${quote})`;
      });
      if (next !== value) el.setAttribute(name, next);
    }
  }
  for (const el of withId) if (!el.id.startsWith(prefix)) el.id = prefix + el.id;
}
