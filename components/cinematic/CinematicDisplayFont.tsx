import { MUSEO_MODERNO_LATIN_900_BASE64, MUSEO_MODERNO_LATIN_UNICODE_RANGE } from "./museo-moderno-latin-900";

// RC-CLS-2: headings painted in a fallback and re-wrapped when the 188 KB MuseoModerno file arrived. This face carries its
// Latin set inline, declared after cinematic.css's full face so it wins for those characters (the full file still loads
// for any other). A data: face is only decoded when a layout first needs it, a frame after the first paint, so the script
// asks for it as soon as the stylesheets have loaded (an inline script runs only after them), before that first layout.
// A server component in the cinematic layout: the bytes go into Rose City's HTML only, never a shared bundle.
export const DISPLAY_FONT_FACE = `@font-face{font-family:CinematicMuseoModerno;src:url(data:font/ttf;base64,${MUSEO_MODERNO_LATIN_900_BASE64}) format('truetype');font-weight:100 900;font-display:swap;unicode-range:${MUSEO_MODERNO_LATIN_UNICODE_RANGE}}`;
export const WARM_DISPLAY_FONT = "document.fonts&&document.fonts.load(\"900 1em CinematicMuseoModerno\").catch(function(){})";

export default function CinematicDisplayFont() {
  return <>
    <style data-cinematic-display-font="" dangerouslySetInnerHTML={{ __html: DISPLAY_FONT_FACE }} />
    <script data-cinematic-font-warmup="" dangerouslySetInnerHTML={{ __html: WARM_DISPLAY_FONT }} />
  </>;
}
