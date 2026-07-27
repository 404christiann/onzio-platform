// ─────────────────────────────────────────────
//  Seed script — migrates lib/data.ts → Supabase
//  Run with: npx tsx scripts/seed.ts
// ─────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Players ───────────────────────────────────

const players = [
  // Goalkeepers
  {
    number: 18,
    name: "Alejandro Mendez",
    caption: null,
    nationality: "🇲🇽",
    position: "Goalkeeper",
    height: "6'2",
    weight: "190 lbs",
    hometown: "Los Angeles, CA",
    age: 24,
    school: "Franklin HS",
    previous_club: null,
    photo_url: "/images/roster/players/goalkeeper1.webp",
    active: true,
  },
  {
    number: 26,
    name: "Mark Hyan",
    caption: null,
    nationality: "🇺🇸",
    position: "Goalkeeper",
    height: "6'3",
    weight: "198 lbs",
    hometown: "Los Angeles, CA",
    age: 22,
    school: "Uni of Portland",
    previous_club: null,
    photo_url: "/images/roster/players/goalkeeper2.webp",
    active: true,
  },
  {
    number: 1,
    name: "Alan Rubio",
    caption: null,
    nationality: "🇺🇸",
    position: "Goalkeeper",
    height: "5'10",
    weight: "180 lbs",
    hometown: "Pasadena, CA",
    age: 18,
    school: "Pasadena HS",
    previous_club: null,
    photo_url: "/images/roster/players/goalkeeper3.webp",
    active: true,
  },
  // Defenders
  {
    number: 66,
    name: "Roberto Mejia",
    caption: null,
    nationality: "🇲🇽",
    position: "Defender",
    height: "6'1",
    weight: "155 lbs",
    hometown: "Bell, CA",
    age: 21,
    school: null,
    previous_club: "Pumas",
    photo_url: "/images/roster/players/defender1.webp",
    active: true,
  },
  {
    number: 3,
    name: "Jordin Estrada",
    caption: null,
    nationality: "🇲🇽",
    position: "Defender",
    height: "5'9",
    weight: "164 lbs",
    hometown: "Los Angeles, CA",
    age: 26,
    school: null,
    previous_club: null,
    photo_url: "/images/roster/players/defender2.webp",
    active: true,
  },
  {
    number: 14,
    name: "Abanda Ajeakwa",
    caption: null,
    nationality: "🇨🇲",
    position: "Defender",
    height: "5'7",
    weight: "154 lbs",
    hometown: "Gardena, CA",
    age: 28,
    school: null,
    previous_club: null,
    photo_url: "/images/roster/players/defender3.webp",
    active: true,
  },
  // Midfielders
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
    previous_club: "Michigan Stars",
    photo_url: "/images/roster/players/mid1.webp",
    active: true,
  },
  {
    number: 6,
    name: "Ulises Grado",
    caption: null,
    nationality: "",
    position: "Midfielder",
    height: "5'11",
    weight: "170 lbs",
    hometown: "Anaheim, CA",
    age: 21,
    school: "Cal State Fullerton",
    previous_club: null,
    photo_url: "/images/roster/players/mid2.webp",
    active: true,
  },
  {
    number: 24,
    name: "Diego Lopez",
    caption: null,
    nationality: "🇲🇽",
    position: "Midfielder",
    height: "6'1",
    weight: "165 lbs",
    hometown: "Los Angeles, CA",
    age: 21,
    school: "Cal State San Bernardino",
    previous_club: "LA Galaxy ACD",
    photo_url: "/images/roster/players/mid3.webp",
    active: true,
  },
  // Forwards
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
    school: null,
    previous_club: "Thunder Bay",
    photo_url: "/images/roster/players/forward1.webp",
    active: true,
  },
  {
    number: 11,
    name: "Roberto Ordóñez",
    caption: null,
    nationality: "🇲🇽",
    position: "Forward",
    height: "5'11",
    weight: "165 lbs",
    hometown: "McAllen, TX",
    age: 24,
    school: "Cal State Fullerton",
    previous_club: null,
    photo_url: "/images/roster/players/forward2.webp",
    active: true,
  },
  {
    number: 9,
    name: "Aidan Apodaca",
    caption: null,
    nationality: "",
    position: "Forward",
    height: "5'9",
    weight: "160 lbs",
    hometown: "Upland, CA",
    age: 29,
    school: "CBU",
    previous_club: "Charleston Battery",
    photo_url: "/images/roster/players/forward3.webp",
    active: true,
  },
];

// ── Staff ─────────────────────────────────────

const staffData = [
  {
    initials: "GM",
    name: "Samuel Whitworth",
    role: "General Manager",
    hometown: "Pasadena, CA",
    photo_url: "/images/roster/staff/staff1.webp",
    active: true,
  },
  {
    initials: "HC",
    name: "Edgardo Artero",
    role: "Head Coach",
    hometown: "Pasadena, CA",
    photo_url: "/images/roster/staff/staff2.webp",
    active: true,
  },
  {
    initials: "AC",
    name: "James Alewine III",
    role: "Assistant Coach",
    hometown: "Monrovia, CA",
    photo_url: "/images/roster/staff/staff3.webp",
    active: true,
  },
];

// ── Fixtures ──────────────────────────────────

const fixtures = [
  {
    date: "May 2, 2026",
    time: "8:00 PM",
    opponent: "Ocelot FC",
    home: true,
    venue: "Arcadia City Hall Stadium",
    address: "240 W Huntington Dr, Arcadia, CA 91007",
  },
  {
    date: "May 8, 2026",
    time: "7:00 PM",
    opponent: "LA Sol Athletics",
    home: false,
    venue: "Cal State LA",
    address: "",
  },
  {
    date: "May 16, 2026",
    time: "8:00 PM",
    opponent: "AMSG FC",
    home: true,
    venue: "Arcadia City Hall Stadium",
    address: "240 W Huntington Dr, Arcadia, CA 91007",
  },
  {
    date: "May 31, 2026",
    time: "8:00 PM",
    opponent: "AYSD D1",
    home: false,
    venue: "Triton Valley Soccer Fields",
    address: "",
  },
  {
    date: "June 6, 2026",
    time: "8:00 PM",
    opponent: "Montclair FC",
    home: true,
    venue: "Arcadia City Hall Stadium",
    address: "240 W Huntington Dr, Arcadia, CA 91007",
  },
];

// ── Seed ──────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding Supabase...\n");

  // Players
  console.log("Inserting players...");
  const { data: insertedPlayers, error: playersError } = await supabase
    .from("players")
    .insert(players)
    .select();
  if (playersError) { console.error("❌ Players error:", playersError.message); process.exit(1); }
  console.log(`✅ ${insertedPlayers.length} players inserted`);

  // Staff
  console.log("Inserting staff...");
  const { data: insertedStaff, error: staffError } = await supabase
    .from("staff")
    .insert(staffData)
    .select();
  if (staffError) { console.error("❌ Staff error:", staffError.message); process.exit(1); }
  console.log(`✅ ${insertedStaff.length} staff inserted`);

  // Fixtures
  console.log("Inserting fixtures...");
  const { data: insertedFixtures, error: fixturesError } = await supabase
    .from("matches")
    .insert(fixtures)
    .select();
  if (fixturesError) { console.error("❌ Fixtures error:", fixturesError.message); process.exit(1); }
  console.log(`✅ ${insertedFixtures.length} fixtures inserted`);

  console.log("\n🎉 Seed complete!");
}

seed();
