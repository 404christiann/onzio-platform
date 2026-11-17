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

/** The two Avenir @font-face rules for a font base URL, or "" when the URL is not safe to use. */
export function avenirFontFaceCss(base: string | undefined): string {
  const safe = safeFontBase(base);
  if (!safe) return "";
  return `@font-face{font-family:'CinematicAvenir';src:url('${safe}/Avenir-Medium.ttf') format('truetype');font-style:normal;font-weight:400 600;font-display:swap}`
    + `@font-face{font-family:'CinematicAvenirHeavy';src:url('${safe}/Avenir-Heavy.ttf') format('truetype');font-style:normal;font-weight:800;font-display:swap}`;
}

export default function CinematicAvenirFonts() {
  const css = avenirFontFaceCss(process.env.NEXT_PUBLIC_FONT_BASE_URL);
  if (!css) return null;
  return <style data-cinematic-avenir-fonts="" dangerouslySetInnerHTML={{ __html: css }} />;
}
