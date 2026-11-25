import type { KnowBeforeYouGoContent, SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";

// Sam's copy, transcribed from "Rose City FC Season Ticket Membership page Drop Down Menu 2027 Final Master.jpg"
// and "Rose City FC KBYG page Drop Down Menu 2027 Final Master.jpg" (Dropbox, 2026-11-07/08). Local seed and tests only.
// Every image starts empty: Sam is sending the icons, logos and the PlayStation photo. Open questions for Sam are
// recorded in docs/phase-11/diverse-city/STATUS.md (onzio-ops) (RC2027-TICKET-PAGES).

const empty = (alt = "") => ({ assetId: null, alt });

const BENEFITS = [
  "Preferred Pricing", "Dedicated Account Services", "25 Raffle Tickets",
  "20% Merch Discounts", "Exclusive Member Events", "Playoffs & Pre-Sales",
  "Partner Discounts", "Lamar Hunt U.S. Open Cup Games", "Exclusive Gift",
];

export const seasonMembershipReferenceContent: SeasonMembershipContent = {
  heading: { title: "Season Ticket Membership", subtitle: "Experience Rose City FC live every home game" },
  intro: {
    text: "Secure your spot for every moment of the 2027 Rose City FC season with a Season Ticket Membership. More than just tickets, Membership gives you the best value, priority access, and exclusive perks all season long.",
    highlights: [
      "The best value for the entire 2027 season with the lowest available ticket prices exclusively for Members.",
      "Have a direct point of contact for your tickets, account questions, and match day needs.",
    ],
    includesHeading: "Includes",
    includes: [
      "7 regular season home games",
      "Playoffs, Nationals, friendly, and U.S. Open Cup games",
      "25 raffle tickets (increase your chance of winning x 5 just by becoming a season ticket holder.)",
      "Get invited to special events with Rose City FC players, coaches, and fellow Members.",
      "Receive a special Rose City FC gift created exclusively for Members.",
      "20% off team store",
      "10% off Niky’s Sports",
      "10% off Tepito Coffee",
      "Foothill Transit Bus pass",
      "Get early access to purchase tickets for playoff matches and select special events.",
      "Enjoy extra tickets to bring friends and family to select home matches.",
    ],
  },
  pricing: {
    visible: true, sectionLabel: "Section",
    columns: ["Full season per match price*", "Single match price", "Full season savings"],
    rows: [{ id: "seat-general", name: "General Seating", prices: ["$5", "$7", "$14"] }],
    footnote: "",
  },
  button: { label: "Buy Season Membership", href: "" },
  benefits: { visible: true, heading: "Member Benefits", items: BENEFITS.map((label, index) => ({ id: `benefit-${index + 1}`, label })) },
  closing: { visible: true, heading: "Become a RCFC member & save" },
  images: {
    ticket: empty("Rose City Futbol Club Under the Lights ticket for Robinson Stadium, Pasadena"),
    "seat-general": empty(),
    ...Object.fromEntries(BENEFITS.map((_, index) => [`benefit-${index + 1}`, empty()])),
  },
};

const TILES = [
  "Pasadena, CA", "Mobile Entry", "Gates Open 7PM",
  "UPSL Premier Regular Season", "$2 On-Site Parking", "EV Parking",
  "Chick-fil-A®", "Tepito Coffee", "Snacks & Beverages",
  "4,599 Capacity", "Halftime Raffle", "Music & Vibes",
  "Niky’s Sports Halftime Kick for Cleats", "Blank", "National Anthem Jackie Portman",
];

export const knowBeforeYouGoReferenceContent: KnowBeforeYouGoContent = {
  heading: { title: "Know Before You Go", subtitle: "Everything you need to know before the match" },
  match: { visible: true, competition: "UPSL Premier Regular Season", watchLabel: "Watch every game live", watchHref: "https://www.youtube.com/@RoseCityFC/live" },
  facts: { visible: true, tiles: TILES.map((label, index) => ({ id: `tile-${index + 1}`, label })) },
  raffle: {
    visible: true, heading: "Halftime Raffle Item", subheading: "PlayStation 5 Console + Controller",
    body: "This week’s halftime raffle item for our home opener is a **PlayStation 5**. Automatically entered into the halftime raffle just by attending the game.",
  },
  donor: {
    visible: true, heading: "This game’s raffle item is donated by", name: "Chronic Tacos",
    body: "Chronic Tacos is an American chain of fast casual restaurants specializing in tacos, Mission or California burritos, tostada bowls, carne asada fries and churros. The first Chronic Tacos restaurant was opened in 2002 in Newport Beach, California, by Daniel Biello and Randy Wyner. As of 2020, the company operates over 60 locations across the United States, Canada and Japan.[3]",
    buttonLabel: "Donate the next raffle item", buttonHref: "",
  },
  images: {
    youtube: empty("YouTube"), raffle: empty("PlayStation 5 console and controller"), donor: empty("Chronic Tacos"),
    ...Object.fromEntries(TILES.map((_, index) => [`tile-${index + 1}`, empty()])),
  },
};
