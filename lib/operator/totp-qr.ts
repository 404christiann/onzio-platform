const UNSUPPORTED_QR_FORMAT =
  "Supabase returned an unsupported TOTP QR format";

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderTotpQrPage(dataUrl: string): string {
  const populatedSvgDataUrl =
    /^data:image\/svg\+xml(?:;[A-Za-z0-9!#$&^_.+\-=]+)*,[\s\S]+$/i;
  if (!populatedSvgDataUrl.test(dataUrl)) {
    throw new Error(UNSUPPORTED_QR_FORMAT);
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
    <meta name="referrer" content="no-referrer">
    <title>Onzio operator TOTP enrollment</title>
    <style>
      html, body { min-height: 100%; margin: 0; }
      body { display: grid; place-items: center; background: #111; }
      img { width: min(80vmin, 640px); height: auto; background: white; padding: 24px; }
    </style>
  </head>
  <body>
    <img src="${escapeHtmlAttribute(dataUrl)}" alt="Private operator TOTP enrollment QR code">
  </body>
</html>
`;
}
