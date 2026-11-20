import { preload } from "react-dom";

// Avenir is a licensed font, so it is never committed: it is served from the
// bucket named by NEXT_PUBLIC_FONT_BASE_URL (inlined by Next at build time).
// Without a usable URL nothing renders and the stacks fall through to Figtree.

const LOCAL_HTTP_HOSTS = new Set(["127.0.0.1", "localhost"]);
// Characters that could end the quoted url() string, the rule, or the <style>.
const UNSAFE_URL_CHARACTERS = /[\s'"()\\<>{};]/;

function safeFontBase(base: string | undefined): string | null {
  const trimmed = (base ?? "").replace(/\/+$/, "");
  if (!trimmed || UNSAFE_URL_CHARACTERS.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const allowed = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HTTP_HOSTS.has(url.hostname));
  if (!allowed || url.username || url.password || url.search || url.hash || trimmed.includes("?") || trimmed.includes("#")) return null;
  return trimmed;
}

// RC-CLS-2: text first paints in a stand-in face and swaps to Avenir when the file arrives. The stand-ins below take
// Avenir's line height and average width, so the swap does not move the page. On Apple devices the stand-in is the
// installed Avenir (same widths, Avenir's line height); elsewhere it is the bundled Figtree, scaled to Avenir's width.
// Measured against Avenir-Medium.ttf / Avenir-Heavy.ttf: ascent 108.4%, descent 46.6% / 47.8%, no line gap; Figtree
// at 400 is 1.8% narrower than Avenir Medium, at 800 1.3% narrower than Avenir Heavy.
export const FIGTREE_LATIN_URL = "/fonts/figtree/figtree-latin-wght-normal.woff2";
const FALLBACK_FACES = [
  "@font-face{font-family:'CinematicAvenirLocal';src:local('Avenir Medium'),local('Avenir-Medium');font-style:normal;font-weight:400 600;ascent-override:108.4%;descent-override:46.6%;line-gap-override:0%}",
  "@font-face{font-family:'CinematicAvenirHeavyLocal';src:local('Avenir Heavy'),local('Avenir-Heavy');font-style:normal;font-weight:800;ascent-override:108.4%;descent-override:47.8%;line-gap-override:0%}",
  `@font-face{font-family:'CinematicAvenirMetric';src:url('${FIGTREE_LATIN_URL}') format('woff2');font-style:normal;font-weight:300 900;font-display:swap;size-adjust:101.8%;ascent-override:106.48%;descent-override:45.78%;line-gap-override:0%}`,
  `@font-face{font-family:'CinematicAvenirHeavyMetric';src:url('${FIGTREE_LATIN_URL}') format('woff2');font-style:normal;font-weight:300 900;font-display:swap;size-adjust:101.3%;ascent-override:107.01%;descent-override:47.19%;line-gap-override:0%}`,
].join("");

/** The Avenir @font-face rules and their swap stand-ins for a font base URL, or "" when the URL is not safe to use. */
export function avenirFontFaceCss(base: string | undefined): string {
  const safe = safeFontBase(base);
  if (!safe) return "";
  return `@font-face{font-family:'CinematicAvenir';src:url('${safe}/Avenir-Medium.ttf') format('truetype');font-style:normal;font-weight:400 600;font-display:swap}`
    + `@font-face{font-family:'CinematicAvenirHeavy';src:url('${safe}/Avenir-Heavy.ttf') format('truetype');font-style:normal;font-weight:800;font-display:swap}`
    + FALLBACK_FACES;
}

export default function CinematicAvenirFonts() {
  const base = process.env.NEXT_PUBLIC_FONT_BASE_URL;
  const css = avenirFontFaceCss(base);
  if (!css) return null;
  // Fetch both files, and the Figtree stand-in, from the document head, so they usually arrive before the first paint.
  const safe = safeFontBase(base)!;
  for (const file of ["Avenir-Medium.ttf", "Avenir-Heavy.ttf"]) preload(`${safe}/${file}`, { as: "font", type: "font/ttf", crossOrigin: "anonymous" });
  preload(FIGTREE_LATIN_URL, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return <style data-cinematic-avenir-fonts="" dangerouslySetInnerHTML={{ __html: css }} />;
}
