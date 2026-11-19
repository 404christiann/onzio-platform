const TOKEN_ATTRS = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-details", "aria-activedescendant", "for"] as const;

/**
 * Makes every `id` inside one inline preview unique by prefixing it, and rewrites the references that point at
 * those ids inside the same subtree (aria-labelledby, aria-describedby, aria-controls, aria-owns, aria-details,
 * aria-activedescendant, label `for` and `href="#…"`). The public components hardcode their ids, and PreviewCards
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
    const href = el.getAttribute("href");
    if (href && href.startsWith("#") && href.length > 1) {
      const target = rewrite(href.slice(1));
      if (target !== href.slice(1)) el.setAttribute("href", `#${target}`);
    }
  }
  for (const el of withId) if (!el.id.startsWith(prefix)) el.id = prefix + el.id;
}
