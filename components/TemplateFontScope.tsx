import type { TemplateKey } from "@/packages/presentation";

// DCFC-D110 registered a dedicated "montserrat-inter-dmsans" font pack for
// `academy@1` (Diverse City FC's template) but nothing ever applied it to
// rendered output -- see `app/layout.tsx` and `styles/globals.css` for the
// full explanation. This scopes that font pack to academy@1 tenants only,
// via a `data-font-pack` attribute that `styles/globals.css` keys off of.
//
// crest@1 used to need the same `data-font-pack="crest"` scoping for its
// "playfair-inter" pack; the 2026-08-18 visual refresh moved crest@1 onto
// the shared "geist" pack instead (packages/presentation/index.ts), which
// is already the root-level `--font-display`/`--font-body` default
// (styles/globals.css `:root`) -- the same reason pathway@1 (also on
// "geist") never needed an override here either. No scoping left to do for
// crest@1.
//
// Renders `display: contents` so it adds no box to the layout tree -- CSS
// custom properties still inherit through it normally, but it cannot affect
// flex/grid child relationships, stacking contexts, or any existing CSS that
// assumes Nav/main/Footer are direct children of <body>.
export default function TemplateFontScope({
  templateKey,
  children,
}: {
  templateKey: TemplateKey | null;
  children: React.ReactNode;
}) {
  const fontPack = templateKey === "academy@1" ? "academy" : undefined;
  return (
    <div data-font-pack={fontPack} className="contents">
      {children}
    </div>
  );
}
