const FLAG_BUCKET_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/flags`;

// Nationality values used by roster records mapped to their exact bucket files.
// Emoji aliases support older/static roster data that used a flag as nationality.
const FLAG_FILES: Record<string, string> = {
  American: "USA.png",
  Cameroonian: "Cameroon.png",
  Guatemalan: "Guatemala.png",
  Japanese: "Japan.png",
  Mexican: "Mexico.png",
  Salvadoran: "ElSalvador.png",
  "🇺🇸": "USA.png",
  "🇨🇲": "Cameroon.png",
  "🇬🇹": "Guatemala.png",
  "🇯🇵": "Japan.png",
  "🇲🇽": "Mexico.png",
  "🇸🇻": "ElSalvador.png",
};

export function getFlagUrl(nationality: string): string | null {
  const filename = FLAG_FILES[nationality.trim()];

  return filename ? `${FLAG_BUCKET_URL}/${encodeURIComponent(filename)}` : null;
}
