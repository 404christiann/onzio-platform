const ROSE_CITY_FLAG_BASE =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/32ceba0b-4e25-52c2-bb6b-d82fb87637a7/flags`;

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

const FLAG_COUNTRY_CODES: Record<string, string> = {
  American: "us",
  Cameroonian: "cm",
  Guatemalan: "gt",
  Japanese: "jp",
  Mexican: "mx",
  Salvadoran: "sv",
  "🇺🇸": "us",
  "🇨🇲": "cm",
  "🇬🇹": "gt",
  "🇯🇵": "jp",
  "🇲🇽": "mx",
  "🇸🇻": "sv",
};

const ROSE_CITY_MIGRATED_FLAG_FILES: Record<string, string> = {
  "USA.png": "def61117-0b21-5ffb-b25b-05158cf77a9a.webp",
  "Cameroon.png": "8cd36b7e-a878-5f53-8818-286991b8d83c.webp",
  "Guatemala.png": "cffa4357-582a-5206-abf0-ace078d16ada.webp",
  "Japan.png": "548fc64c-c361-5507-9e8a-11dd641816f6.webp",
  "Mexico.png": "951f521a-1f0f-5006-9ffc-44de3815c5db.webp",
  "ElSalvador.png": "7907e084-bc07-5298-bfb8-bf091caad992.webp",
};

export function getFlagUrl(
  nationality: string,
  clubSlug?: string,
): string | null {
  const filename = FLAG_FILES[nationality.trim()];

  if (!filename || clubSlug !== "rose-city") return null;

  const migratedFilename = ROSE_CITY_MIGRATED_FLAG_FILES[filename];
  return migratedFilename
    ? `${ROSE_CITY_FLAG_BASE}/${migratedFilename}`
    : null;
}

export function getFlagCountryCode(nationality: string): string | null {
  return FLAG_COUNTRY_CODES[nationality.trim()] ?? null;
}
