import type {
  DBAboutPageContent,
  DBClubLogoPageContent,
} from "@/lib/db-types";
import { onzioMediaStoragePathFromPublicUrl } from "@/lib/media-url";

const ABOUT_ASSETS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Aboutassets`;

export type AboutValue = {
  title: string;
  description: string;
};

export type ClubLogoFeature = {
  title: string;
  icon_url: string;
  icon_size: number;
  icon_scale: number;
  patch_url: string;
  description: string;
};

export type ClubLogoColorCard = {
  label: string;
  image_url: string;
};

function aboutAssetUrl(path: string): string {
  return `${ABOUT_ASSETS}/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export const DEFAULT_ABOUT_PAGE_CONTENT: DBAboutPageContent = {
  id: 1,
  hero_title: "About Club",
  story_paragraphs: [
    "Rose City FC was founded to give Pasadena a semi-professional club it could call its own. What started as a small group with a shared idea has grown into a full roster, a coaching staff, and a matchday community that fills the stands at Arcadia City Hall Stadium.",
    "Since our first season in the UPSL, the club has built its identity on disciplined, attacking soccer and a refusal to be outworked. That identity carried us to a UPSL Championship in 2024 - a milestone we treat as a beginning, not a destination.",
    "Today, Rose City FC is building toward the next level - investing in player development, deepening our roots in the Pasadena community, and giving local talent a real pathway forward in the sport.",
  ],
  feature_image_url: "/images/home/homepageSlideShowPic1.jpeg",
  values_heading: "Our Values",
  values: [
    {
      title: "Community",
      description: "Rose City FC belongs to Pasadena - every matchday is a reason for this city to gather.",
    },
    {
      title: "Competition",
      description: "We compete to win. Every season, every match, every training session is a step toward silverware.",
    },
    {
      title: "Character",
      description: "On the pitch and off it, the club is built by players and staff who represent this crest with pride.",
    },
  ],
  closing_text: "Join us at Arcadia City Hall Stadium this season.",
  closing_cta_label: "See the Schedule",
  closing_cta_href: "/schedule",
  updated_at: "",
};

export const EMPTY_ABOUT_PAGE_CONTENT: DBAboutPageContent = {
  id: 0,
  hero_title: "About",
  story_paragraphs: [],
  feature_image_url: "",
  values_heading: "",
  values: [],
  closing_text: "",
  closing_cta_label: "",
  closing_cta_href: "",
  updated_at: "",
};

export const DEFAULT_CLUB_LOGO_FEATURES: ClubLogoFeature[] = [
  {
    title: "The Name",
    icon_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Rose%20City%20Futbol%20Club.png`,
    icon_size: 70,
    icon_scale: 2.25,
    patch_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Patch%20Rose%20City%20Futbol%20Club.png`,
    description:
      "Rose City's crest reflects Pasadena's rich history and what makes the city special as a global city.",
  },
  {
    title: "The Rose",
    icon_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Red%20Rose.png`,
    icon_size: 50,
    icon_scale: 2.25,
    patch_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Patch%20Rose.png`,
    description:
      "The rose symbolizes the world-famous Rose Parade that began January 1, 1890 and has run every year since. Residents, many from the snowy Midwest, covered their horse-drawn wagons in roses to display the area's vitality in winter.",
  },
  {
    title: "The #23",
    icon_url: `${ABOUT_ASSETS}/Rose%20City%20FC%2023.png`,
    icon_size: 90,
    icon_scale: 1.22,
    patch_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Patch_23.png`,
    description:
      "Pasadena's 23 square miles is home to 138,000 residents, the Rose Bowl stadium, and is located at the northern origin of the 110 freeway, the first freeway in the U.S.",
  },
  {
    title: "The Crown",
    icon_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Crown.png`,
    icon_size: 70,
    icon_scale: 1.45,
    patch_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Patch%20Crown.png`,
    description:
      "The San Gabriel Mountains crown the area with rugged majesty. Hiking trails lead to mountain peaks overseeing the entire Los Angeles basin.",
  },
  {
    title: "The Key",
    icon_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Key.png`,
    icon_size: 50,
    icon_scale: 2.25,
    patch_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Patch%20Key.png`,
    description:
      'Pasadena is the most prominent city in the San Gabriel Valley and derives its name from the Chippewa language meaning "Key of the Valley" and "Crown of the Valley." Pasadena is "key" to artistic, educational, and scientific institutions of global renown.',
  },
];

export const DEFAULT_CLUB_LOGO_COLOR_CARDS: ClubLogoColorCard[] = [
  {
    label: "Rose Parade Red",
    image_url: aboutAssetUrl(
      "hexColors/Rose CIty FC Brand Identity Rose Parade Red Color Black.png",
    ),
  },
  {
    label: "12AM Midnight",
    image_url: aboutAssetUrl(
      "hexColors/Rose CIty FC Brand Identity 12am at Midnight Color Black.png",
    ),
  },
  {
    label: "Faded White",
    image_url: aboutAssetUrl(
      "hexColors/Rose CIty FC Brand Identity Faded White Color Black.png",
    ),
  },
  {
    label: "Rose Stem Green",
    image_url: aboutAssetUrl(
      "hexColors/Rose CIty FC Brand Identity Rose Stem Color Black.png",
    ),
  },
  {
    label: "Steel",
    image_url: aboutAssetUrl("hexColors/Rose CIty FC Brand Identity Steel Color Black.png"),
  },
  {
    label: "Parrot",
    image_url: aboutAssetUrl("hexColors/Rose CIty FC Brand Identity Parrot Colors Black.png"),
  },
];

export const DEFAULT_CLUB_LOGO_PAGE_CONTENT: DBClubLogoPageContent = {
  id: 1,
  annotated_image_url: `${ABOUT_ASSETS}/ClubLogo_initial_image.png`,
  features: DEFAULT_CLUB_LOGO_FEATURES,
  map_image_url: `${ABOUT_ASSETS}/Rose%20City%20FC%20Official%20Pasadena%20Map%202027.png`,
  color_cards: DEFAULT_CLUB_LOGO_COLOR_CARDS,
  updated_at: "",
};

export const EMPTY_CLUB_LOGO_PAGE_CONTENT: DBClubLogoPageContent = {
  id: 0,
  annotated_image_url: "",
  features: [],
  map_image_url: "",
  color_cards: [],
  updated_at: "",
};

export function normalizeAboutValues(value: unknown): AboutValue[] {
  if (!Array.isArray(value)) return DEFAULT_ABOUT_PAGE_CONTENT.values;
  const values = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      return {
        title: typeof record.title === "string" ? record.title : "",
        description: typeof record.description === "string" ? record.description : "",
      };
    })
    .filter((item): item is AboutValue => Boolean(item && item.title.trim()));
  return values.length > 0 ? values : DEFAULT_ABOUT_PAGE_CONTENT.values;
}

export function normalizeStoryParagraphs(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_ABOUT_PAGE_CONTENT.story_paragraphs;
  const paragraphs = value
    .filter((paragraph): paragraph is string => typeof paragraph === "string")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : DEFAULT_ABOUT_PAGE_CONTENT.story_paragraphs;
}

export function normalizeClubLogoFeatures(value: unknown): ClubLogoFeature[] {
  if (!Array.isArray(value)) return DEFAULT_CLUB_LOGO_FEATURES;
  const features = value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const fallback = DEFAULT_CLUB_LOGO_FEATURES[index] ?? DEFAULT_CLUB_LOGO_FEATURES[0];
      return {
        title: typeof record.title === "string" ? record.title : fallback.title,
        icon_url: typeof record.icon_url === "string" ? record.icon_url : fallback.icon_url,
        icon_size: typeof record.icon_size === "number" ? record.icon_size : fallback.icon_size,
        icon_scale: typeof record.icon_scale === "number" ? record.icon_scale : fallback.icon_scale,
        patch_url: typeof record.patch_url === "string" ? record.patch_url : fallback.patch_url,
        description:
          typeof record.description === "string" ? record.description : fallback.description,
      };
    })
    .filter((item): item is ClubLogoFeature => Boolean(item));
  return features.length > 0 ? features : DEFAULT_CLUB_LOGO_FEATURES;
}

export function normalizeClubLogoColorCards(value: unknown): ClubLogoColorCard[] {
  if (!Array.isArray(value)) return DEFAULT_CLUB_LOGO_COLOR_CARDS;
  const cards = DEFAULT_CLUB_LOGO_COLOR_CARDS.map((fallback, index) => {
    const item = value[index];
    if (!item || typeof item !== "object") return fallback;
    const record = item as Record<string, unknown>;
    return {
      label: typeof record.label === "string" && record.label.trim()
        ? record.label
        : fallback.label,
      image_url: typeof record.image_url === "string" && record.image_url.trim()
        ? record.image_url
        : fallback.image_url,
    };
  });
  return cards;
}

export function aboutStoragePathFromPublicUrl(url: string): string | null {
  const onzioPath = onzioMediaStoragePathFromPublicUrl(url, "about");
  if (onzioPath) return onzioPath;
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/about-page/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    return path.startsWith("content/") ? path : null;
  } catch {
    return null;
  }
}
