// ─────────────────────────────────────────────
//  Rose City FC — Static Data
// ─────────────────────────────────────────────

export type GoalkeeperStats = {
  goalsAgainst: number;
  saves: number;
  cleanSheets: number;
  starts: number;
  yellow: number;
  red: number;
  mins: number;
};

export type FieldStats = {
  goals: number;
  assists: number;
  tackles: number;
  starts: number;
  yellow: number;
  red: number;
  mins: number;
  offsides: number;
  fouls: number;
  foulsSuffered: number;
};

export type Player = {
  id?: string;          // Supabase UUID — present for DB-fetched players, undefined for static data
  number: number;
  name: string;
  caption?: string;
  nationality: string;
  position: "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
  height: string;
  weight: string;
  hometown: string;
  age: number;
  school?: string;
  previousClub?: string;
  image: string;
  stats: GoalkeeperStats | FieldStats;
  bio?: string;
  pronunciation?: string;
  foot?: string;
  actionPhotos?: string[];
};

export type Staff = {
  initials: string;
  name: string;
  role: string;
  hometown: string;
  nationality: string;
  bio: string | null;
  image: string;
};

export type Fixture = {
  date: string;
  opponent: string;
  opponentShortName?: string | null;
  opponentLogoUrl?: string | null;
  competition?: string | null;
  sponsorName?: string | null;
  sponsorLogoUrl?: string | null;
  sponsorLink?: string | null;
  home: boolean;
  time: string;
  venue: string;
  address?: string;
  city?: string | null;
  state?: string | null;
  roseCityScore?: number | null;
  opponentScore?: number | null;
};

export type ShopProduct = {
  name: string;
  description: string;
  buyLink: string;
  storeAddress: string;
  includes: string[];
  addOn?: string;
  slideshowImages: string[];
  nikysImages: string[];
};

// ─────────────────────────────────────────────
//  ROSTER
// ─────────────────────────────────────────────

export const goalkeepers: Player[] = [
  {
    number: 18,
    name: "Alejandro Mendez",
    nationality: "🇲🇽",
    position: "Goalkeeper",
    height: "6'2",
    weight: "190 lbs",
    hometown: "Los Angeles, CA",
    age: 24,
    school: "Franklin HS",
    image: "/images/roster/players/goalkeeper1.webp",
    stats: { goalsAgainst: 8, saves: 13, cleanSheets: 0, starts: 4, yellow: 0, red: 0, mins: 280 },
  },
  {
    number: 26,
    name: "Mark Hyan",
    nationality: "🇺🇸",
    position: "Goalkeeper",
    height: "6'3",
    weight: "198 lbs",
    hometown: "Los Angeles, CA",
    age: 22,
    school: "Uni of Portland",
    image: "/images/roster/players/goalkeeper2.webp",
    stats: { goalsAgainst: 0, saves: 0, cleanSheets: 0, starts: 0, yellow: 0, red: 0, mins: 0 },
  },
  {
    number: 1,
    name: "Alan Rubio",
    nationality: "🇺🇸",
    position: "Goalkeeper",
    height: "5'10",
    weight: "180 lbs",
    hometown: "Pasadena, CA",
    age: 18,
    school: "Pasadena HS",
    image: "/images/roster/players/goalkeeper3.webp",
    stats: { goalsAgainst: 2, saves: 8, cleanSheets: 1, starts: 2, yellow: 0, red: 0, mins: 93 },
  },
];

export const defenders: Player[] = [
  {
    number: 66,
    name: "Roberto Mejia",
    nationality: "🇲🇽",
    position: "Defender",
    height: "6'1",
    weight: "155 lbs",
    hometown: "Bell, CA",
    age: 21,
    previousClub: "Pumas",
    image: "/images/roster/players/defender1.webp",
    stats: { goals: 0, assists: 0, tackles: 0, starts: 3, yellow: 0, red: 0, mins: 138, offsides: 0, fouls: 0, foulsSuffered: 0},
  },
  {
    number: 3,
    name: "Jordin Estrada",
    nationality: "🇲🇽",
    position: "Defender",
    height: "5'9",
    weight: "164 lbs",
    hometown: "Los Angeles, CA",
    age: 26,
    image: "/images/roster/players/defender2.webp",
    stats: { goals: 0, assists: 0, tackles: 0, starts: 4, yellow: 0, red: 0, mins: 185, offsides: 0, fouls: 0, foulsSuffered: 0},
  },
  {
    number: 14,
    name: "Abanda Ajeakwa",
    nationality: "🇨🇲",
    position: "Defender",
    height: "5'7",
    weight: "154 lbs",
    hometown: "Gardena, CA",
    age: 28,
    image: "/images/roster/players/defender3.webp",
    stats: { goals: 0, assists: 0, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 93, offsides: 0, fouls: 0, foulsSuffered: 0},
  },
];

export const midfielders: Player[] = [
  {
    number: 25,
    name: "D'Morea Alewine",
    caption: "(C)",
    nationality: "🇺🇸",
    position: "Midfielder",
    height: "5'7",
    weight: "160 lbs",
    hometown: "Pasadena, CA",
    age: 27,
    school: "Cal State LA",
    previousClub: "Michigan Stars",
    image: "/images/roster/players/mid1.webp",
    stats: { goals: 0, assists: 1, tackles: 2, starts: 2, yellow: 0, red: 0, mins: 187, offsides: 0, fouls: 0, foulsSuffered: 0},
  },
  {
    number: 6,
    name: "Ulises Grado",
    nationality: "",
    position: "Midfielder",
    height: "5'11",
    weight: "170 lbs",
    hometown: "Anaheim, CA",
    age: 21,
    school: "Cal State Fullerton",
    image: "/images/roster/players/mid2.webp",
    stats: { goals: 1, assists: 0, tackles: 0, starts: 1, yellow: 0, red: 0, mins: 93, offsides: 0, fouls: 0, foulsSuffered: 0},
  },
  {
    number: 24,
    name: "Diego Lopez",
    nationality: "🇲🇽",
    position: "Midfielder",
    height: "6'1",
    weight: "165 lbs",
    hometown: "Los Angeles, CA",
    age: 21,
    school: "Cal State San Bernardino",
    previousClub: "LA Galaxy ACD",
    image: "/images/roster/players/mid3.webp",
    stats: { goals: 0, assists: 0, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, foulsSuffered: 0},
  },
];

export const forwards: Player[] = [
  {
    number: 91,
    name: "Germán Alfaro",
    caption: "(C)",
    nationality: "🇲🇽",
    position: "Forward",
    height: "5'7",
    weight: "155 lbs",
    hometown: "Pasadena, CA",
    age: 33,
    previousClub: "Thunder Bay",
    image: "/images/roster/players/forward1.webp",
    stats: { goals: 2, assists: 0, tackles: 1, starts: 5, yellow: 0, red: 0, mins: 280, offsides: 0, fouls: 0, foulsSuffered: 0},
  },
  {
    number: 11,
    name: "Roberto Ordóñez",
    nationality: "🇲🇽",
    position: "Forward",
    height: "5'11",
    weight: "165 lbs",
    hometown: "McAllen, TX",
    age: 24,
    school: "Cal State Fullerton",
    image: "/images/roster/players/forward2.webp",
    stats: { goals: 0, assists: 0, tackles: 0, starts: 1, yellow: 0, red: 0, mins: 93, offsides: 0, fouls: 0, foulsSuffered: 0 },
  },
  {
    number: 9,
    name: "Aidan Apodaca",
    nationality: "",
    position: "Forward",
    height: "5'9",
    weight: "160 lbs",
    hometown: "Upland, CA",
    age: 29,
    school: "CBU",
    previousClub: "Charleston Battery",
    image: "/images/roster/players/forward3.webp",
    stats: { goals: 1, assists: 0, tackles: 0, starts: 1, yellow: 0, red: 0, mins: 93, offsides: 0, fouls: 0, foulsSuffered: 0},
  },
];

export const staff: Staff[] = [
  {
    initials: "GM",
    name: "Samuel Whitworth",
    role: "General Manager",
    hometown: "Pasadena, CA",
    nationality: "",
    bio: null,
    image: "/images/roster/staff/staff1.webp",
  },
  {
    initials: "HC",
    name: "Edgardo Artero",
    role: "Head Coach",
    hometown: "Pasadena, CA",
    nationality: "",
    bio: null,
    image: "/images/roster/staff/staff2.webp",
  },
  {
    initials: "AC",
    name: "James Alewine III",
    role: "Assistant Coach",
    hometown: "Monrovia, CA",
    nationality: "",
    bio: null,
    image: "/images/roster/staff/staff3.webp",
  },
];

// ─────────────────────────────────────────────
//  SCHEDULE
// ─────────────────────────────────────────────

export const schedule: Fixture[] = [
  {
    date: "May 2, 2026",
    opponent: "Ocelot FC",
    home: true,
    time: "8:00 PM",
    venue: "Arcadia City Hall Stadium",
    address: "240 W Huntington Dr, Arcadia, CA 91007",
  },
  {
    date: "May 8, 2026",
    opponent: "LA Sol Athletics",
    home: false,
    time: "7:00 PM",
    venue: "Cal State LA",
    address: "",
  },
  {
    date: "May 16, 2026",
    opponent: "AMSG FC",
    home: true,
    time: "8:00 PM",
    venue: "Arcadia City Hall Stadium",
    address: "240 W Huntington Dr, Arcadia, CA 91007",
  },
  {
    date: "May 31, 2026",
    opponent: "AYSD D1",
    home: false,
    time: "8:00 PM",
    venue: "Triton Valley Soccer Fields",
    address: "",
  },
  {
    date: "June 6, 2026",
    opponent: "Montclair FC",
    home: true,
    time: "8:00 PM",
    venue: "Arcadia City Hall Stadium",
    address: "240 W Huntington Dr, Arcadia, CA 91007",
  },
];

// ─────────────────────────────────────────────
//  SHOP
// ─────────────────────────────────────────────

export const shopProduct: ShopProduct = {
  name: "Rose City Thorn Edition 2026 Match Home Jersey",
  description:
    "The official 2026 match home jersey. Nike Dri-FIT technology, authentic match construction, featuring the Rose City crest, league patch, and team sponsors.",
  buyLink:
    "https://www.nikys-sports.com/products/nike-rose-city-fc-home-mens-dri-fit-soccer-jersey",
  storeAddress: "33 E Colorado Blvd, Pasadena, CA",
  includes: [
    "Authentic match jersey",
    "Any name & number",
    "League patch",
    "Team sponsor badges",
    "Raffle ticket included",
  ],
  addOn: "Custom name + $10",
  slideshowImages: [
    "/images/shop/rosecityshirt1.webp",
    "/images/shop/rosecityshirt2.jpeg",
    "/images/shop/rosecityshirt3.jpeg",
    "/images/shop/rosecityshirt4.jpeg",
    "/images/shop/rosecityshirt5.webp",
    "/images/shop/rosecityshirt6.jpeg",
  ],
  nikysImages: [
    "/images/shop/shopSlideshowNickysports1.jpeg",
    "/images/shop/shopSlideshowNickysports2.jpeg",
    "/images/shop/shopSlideshowNickysports3.jpeg",
    "/images/shop/shopSlideshowNickysports4.jpeg",
    "/images/shop/shopSlideshowNickysports5.jpeg",
  ],
};

// ─────────────────────────────────────────────
//  NEXT MATCH (for countdown + hero CTA)
// ─────────────────────────────────────────────

export const nextMatch = schedule[0];
