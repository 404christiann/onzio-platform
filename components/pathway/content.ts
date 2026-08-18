import type { PathwayCta } from "@/components/pathway/PathwaySection";
import type { PathwayCalmStoryProps } from "@/components/pathway/PathwayCalmStory";
import type { PathwayHomeHeroProps } from "@/components/pathway/PathwayHomeHero";
import type { PathwayHeroProps } from "@/components/pathway/PathwayHero";
import type { PathwayRailProps } from "@/components/pathway/PathwayRail";
import type { PathwayFeatureGridProps } from "@/components/pathway/PathwayFeatureGrid";
import type { PathwayMissionProps } from "@/components/pathway/PathwayMission";
import type { PathwaySpecListProps } from "@/components/pathway/PathwaySpecList";
import type { PathwayNumberedStepsProps } from "@/components/pathway/PathwayNumberedSteps";
import type { PathwayPriceCardsProps } from "@/components/pathway/PathwayPriceCards";
import type { PathwayPartnerStripProps } from "@/components/pathway/PathwayPartnerStrip";
import type { PathwayContactFormProps } from "@/components/pathway/PathwayContactForm";
import type { PathwayLegalDocProps } from "@/components/pathway/PathwayLegalDoc";
import type { PathwayAcademyEditorialProps } from "@/components/pathway/PathwayAcademyEditorial";
import type { PathwayYouthJoinProps } from "@/components/pathway/PathwayYouthJoin";
import type { PathwaySeniorInterestProps } from "@/components/pathway/PathwaySeniorInterest";
import type { PathwayUpslTryoutSpotlightProps } from "@/components/pathway/PathwayUpslTryoutSpotlight";
import type { PathwayUpslMatchChannelPanelProps } from "@/components/pathway/PathwayUpslMatchChannelPanel";
import type { PathwayMerchStoreProps } from "@/components/pathway/PathwayMerchStore";
import type { PathwayAboutEditorialProps } from "@/components/pathway/PathwayAboutEditorial";
import type { PathwayEditorialCarouselProps } from "@/components/pathway/PathwayEditorialCarousel";
import type { PathwayUpslRosterProps } from "@/components/pathway/PathwayUpslRoster";
import type { PathwayUpslFixturesProps } from "@/components/pathway/PathwayUpslFixtures";

/**
 * Hardcoded copy for every pathway@1 route (MLA P1 Step 5).
 *
 * This module is deliberately the single place Phase 1 copy lives. Phase 2
 * replaces it with DB-backed content domains, and that swap should touch
 * this file and the route pages only — never the section components, which
 * take all of their words as props.
 *
 * Two rules govern what may be written here:
 *
 * 1. Real identity is used where it is real: the club name, the four
 *    pathway stage names, and the United Premier Soccer League affiliation.
 * 2. Nothing is invented. Prices, dates, venues, age groups, squad details,
 *    staff names and partner names remain TBC unless Christian supplies a
 *    first-party reference for them. Confirmed reference material may be
 *    transcribed here; unknown facts stay first-class TBC rows rather than
 *    plausible-looking fiction.
 *
 * Booking CTAs use an explicit gateway action and retain /book-training as a
 * progressive fallback. The site presents verified options, then hands the
 * selected action to Acuity; it never embeds scheduling or collects payment.
 */

export const CLUB_NAME = "Manu Ledesma Academy";
export const LEAGUE_NAME = "United Premier Soccer League";

const BOOK_TRAINING_CTA: PathwayCta = {
  label: "Book training",
  href: "/book-training",
  action: "training-gateway",
};

/** Shared line for informational figures elsewhere on the pathway site. */
const NO_PAYMENT_NOTE =
  "Nothing is bought or paid for on this site. Get in touch and we'll confirm availability and cost with you directly.";

/** Shared line for any spec grid carrying TBC rows. */
const TBC_NOTE =
  "Rows marked TBC are still being confirmed by the club. They'll be published here as soon as they're settled.";

/* ============================ HOME ============================ */

/**
 * Home photo slots. The photographs themselves live in the media pipeline
 * (onzio-media objects + media_assets rows, linked through
 * homepage_slideshow_photos by sort_order — seeded by
 * scripts/seed-mla-local.ts); the page resolves them server-side and merges
 * them into these props. The club-supplied editorial posters are a separate
 * normalized static set below; they do not consume these database slots. The
 * sort_order convention for the five dynamic photographs is:
 *
 *   0 — leader photo (Manu at the goal), Home leader band
 *   1 — strength & agility photo, expect-grid column 1
 *   2 — foot-skills photo, expect-grid column 2
 *   3 — teamwork photo, expect-grid column 3
 *   4 — squad team photo, Home hero editorial media panel
 */
export const HOME_PHOTO_SLOTS = {
  leader: 0,
  agility: 1,
  footSkills: 2,
  teamwork: 3,
  heroBackground: 4,
} as const;

export const homeContent: {
  hero: PathwayHomeHeroProps;
  leader: PathwayCalmStoryProps;
  rail: PathwayRailProps;
  expect: PathwayFeatureGridProps;
  partners: PathwayPartnerStripProps;
  mission: PathwayMissionProps;
} = {
  hero: {
    eyebrow: CLUB_NAME,
    headlineTop: "One club.",
    headlineBottom: "Every stage of the game.",
    sub: `Technical training, youth football, senior football and a route into the ${LEAGUE_NAME} — all under one badge.`,
    primaryCta: BOOK_TRAINING_CTA,
  },
  // The leader/bio band. Facts are drawn from the club's own published
  // material: Manu's journey from Quilmes, Argentina through an
  // international professional career (including FC Cincinnati) to
  // Cincinnati, and the academy's offer of elite training, expert coaching
  // and mentorship. This is a real person's professional bio — reword only
  // with care.
  leader: {
    heading: CLUB_NAME,
    portraitCaption: "Experience passed forward.",
    items: [
      {
        label: "Why the academy exists",
        paragraphs: [
          {
            text: "We're dedicated to nurturing the next generation of soccer players through elite training, expert coaching and mentorship — building technical skill, tactical understanding and physical fitness, and shaping character along the way.",
          },
        ],
      },
      {
        label: "Who leads the work",
        paragraphs: [
          {
            lead: "Our leader: Manu Ledesma.",
            text: "Manu's journey began in Quilmes, Argentina, and carried him through an international professional career — including his years with FC Cincinnati — before Cincinnati became home. He brings the lessons of that career to every session, committed to mentoring young players in the game and beyond it.",
          },
        ],
      },
      {
        label: "What players receive",
        offers: [
          {
            title: "Elite training programs",
            description:
              "Technical, tactical and physical development built around the individual player.",
          },
          {
            title: "Expert coaching",
            description:
              "Sessions led by professionals who have played the game at the highest level.",
          },
          {
            title: "Mentorship",
            description:
              "Guidance in soccer and personal development, on and off the field.",
          },
        ],
      },
    ],
    primaryCta: BOOK_TRAINING_CTA,
    secondaryCta: { label: "More about the club", href: "/about" },
    mediaCaption: "Club photography to come.",
  },
  rail: {
    eyebrow: "The pathway",
    heading: "Four stages, one club.",
    intro:
      "Players join wherever they are and move up when they're ready. The badge doesn't change.",
    stages: [
      {
        label: "Academy",
        href: "/academy",
        caption: "Individual and small-group technical work.",
      },
      {
        label: "Youth Club",
        href: "/youth-club",
        caption: "Competitive team football for youth players.",
      },
      {
        label: "Senior Club",
        href: "/senior-club",
        caption: "The step up into adult football.",
      },
      {
        label: "UPSL",
        href: "/upsl",
        caption: `Our senior route into the ${LEAGUE_NAME}.`,
      },
    ],
  },
  // The three-column expect-grid. Column titles are the club's own
  // established program names; the paragraphs are the club's published
  // descriptions tightened to this site's voice.
  expect: {
    eyebrow: "Inside the sessions",
    heading: "What your player can expect",
    columns: [
      {
        focusLabel: "Physical readiness",
        title: "Strength & Agility Training",
        body: "Footwork drills, plyometrics, reaction work and balance training that sharpen how quickly a player changes direction. The return is speed, coordination and stability — and a body better protected against injury.",
        mediaCaption: "Agility session photography to come.",
      },
      {
        focusLabel: "Technical command",
        title: "Leveled Up Foot Skills",
        body: "Dribbling, passing, receiving, juggling, toe touches — repetition that puts the ball under a player's command, even under pressure. Better ball handling builds confidence, and confidence changes performance.",
        mediaCaption: "Foot-skills photography to come.",
      },
      {
        focusLabel: "Collective intelligence",
        title: "Teamwork & Teammates",
        body: "Soccer is decided by players working together. Sessions build the communication, coordination and trust that turn individuals into a team — one that keeps the ball, makes better decisions and backs each other up.",
        mediaCaption: "Team photography to come.",
      },
    ],
  },
  partners: {
    label: "Club partners",
    count: 6,
    note: "Partner announcements to come.",
  },
  // The closing mission statement. The quote is the club's own, verbatim
  // from its published mission graphic. Social destinations are the club's
  // published first-party channels (documented in the site research of
  // mlasoccer.com) — confirm with the club before launch.
  mission: {
    eyebrow: "Our mission",
    quote:
      "We're dedicated to fostering a soccer culture and supporting the growth of the sport in Cincinnati, working every day to inspire and strengthen the next generation. This is just the beginning!",
    attribution: `${CLUB_NAME} — Cincinnati, Ohio`,
    socialLabel: "Follow the academy",
    socialLinks: [
      {
        network: "instagram",
        label: `${CLUB_NAME} on Instagram`,
        href: "https://www.instagram.com/manuledesmaacademy/",
      },
      {
        network: "facebook",
        label: `${CLUB_NAME} on Facebook`,
        href: "https://www.facebook.com/manuledesmaacademy/",
      },
      {
        network: "x",
        label: `${CLUB_NAME} on X`,
        href: "https://x.com/ledesmaacademy",
      },
    ],
  },
};

/* =========================== ACADEMY =========================== */

export const academyContent: {
  hero: PathwayHeroProps;
  editorial: PathwayAcademyEditorialProps;
} = {
  hero: {
    variant: "left",
    headlineTop: "Start with",
    headlineBottom: "the technical work.",
    sub: "The academy is the first stage of the pathway, and where players build the individual foundation everything after it rests on.",
    primaryCta: BOOK_TRAINING_CTA,
  },
  editorial: {
    eyebrow: "Player development",
    heading: "Our Academy",
    body: [
      `${CLUB_NAME} stands out due to its personalized coaching approach, tailored to each player's unique needs and skill level. Our elite training programs focus on developing technical proficiency, tactical understanding, and physical conditioning. We offer specialized drills and exercises designed by professional coaches, ensuring players receive top-tier instruction.`,
      `Additionally, our academy emphasizes a supportive and motivating environment, fostering a love for the game and encouraging continuous improvement. With a commitment to excellence and a track record of success, ${CLUB_NAME} provides an unparalleled soccer training experience that prepares players for competitive play and personal growth.`,
    ],
    media: {
      src: "/images/pathway/academy-session-4558c673.webp",
      alt: "Academy players listen to their coach during a field session.",
    },
  },
};

/* ========================= YOUTH CLUB ========================= */

export const youthClubContent: {
  hero: PathwayHeroProps;
  join: PathwayYouthJoinProps;
} = {
  hero: {
    variant: "left",
    headlineTop: "From training",
    headlineBottom: "into a team.",
    sub: "The youth club is the second stage of the pathway — where academy work turns into competitive team football.",
    primaryCta: {
      label: "Book Training",
      href: "/book-training",
      action: "training-gateway",
    },
  },
  join: {
    heading: "Join us!",
    body: [
      "Our youth team is founded on the belief that soccer can leave a lasting impact beyond the field. We are building a program dedicated to growth, community and the love of the game.",
    ],
    listIntro: "We offer year-round play:",
    items: [
      { label: "Indoor teams in both Summer and Winter" },
      { label: "Year-round training" },
    ],
    media: {
      src: "/images/pathway/academy-huddle-a9b9250f.webp",
      alt: "Youth players and their coach bring their hands together on the field.",
    },
  },
};

/* ========================= SENIOR CLUB ========================= */

export const seniorClubContent: {
  interest: PathwaySeniorInterestProps;
} = {
  interest: {
    heading: "Coming soon!",
    intro:
      "The next stage of the pathway is taking shape. Register your interest and we'll share senior-team opportunities as soon as they are confirmed.",
    formEyebrow: "Register interest",
    formHeading: "Want to be part of it?",
    formIntro:
      "Tell us who you are, how to reach you and what you are looking for from senior football.",
    submitLabel: "Register interest",
    successMessage:
      "Thanks — your interest is registered. The club will be in touch when there is an update.",
    fallbackEmail: "manuledesmaacademy@gmail.com",
  },
};

/* ============================ UPSL ============================ */

export const upslContent: {
  tryouts: PathwayUpslTryoutSpotlightProps;
  channel: Omit<
    PathwayUpslMatchChannelPanelProps,
    "channelName" | "channelCrest"
  >;
} = {
  tryouts: {
    heading: "Fall Season UPSL — Free Tryouts",
    subheading: "Your next opportunity starts here.",
    body: [
      "Think you have what it takes to compete at the next level?",
      "This schedule reflects the free UPSL Fall Season Tryouts previously advertised by the club, where players could showcase their talent in front of the coaching staff.",
      "Contact the academy to ask about upcoming UPSL opportunities and confirmed registration dates.",
    ],
    date: "July 2 & July 3",
    time: "9:00 PM",
    location: "Riverside Park | Cincinnati, Ohio",
    cta: {
      label: "Register Here",
      href: "https://docs.google.com/forms/d/e/1FAIpQLSdc4zEO4hF3rDazZz2IkEpYf5hf2PKgYkAwe3uQ9cWYf0fxrA/viewform",
    },
    image: {
      src: "/images/pathway/upsl-celebration-c31bfab4.webp",
      alt: "UPSL players celebrate together after a match.",
    },
  },
  channel: {
    kicker: "Official match channel",
    headlineLead: "Subscribe to our official YouTube channel",
    headlineEmphasis: "Watch our games live!",
    body: [
      "Follow match coverage, team updates and the moments behind the season on our official YouTube channel.",
    ],
    bannerMedia: {
      src: "/images/pathway/upsl-teamwork-54151d0d.webp",
      alt: "Five players in orange kits pose together on the field after a match.",
    },
    channelHandle: "@ManuLedesmaAcademy · Official channel",
    subscribeAction: {
      label: "Subscribe on YouTube",
      href: "https://www.youtube.com/@ManuLedesmaAcademy?sub_confirmation=1",
    },
    watchAction: {
      label: "Watch games live",
      href: "https://www.youtube.com/@ManuLedesmaAcademy/streams",
    },
  },
};

const DEFAULT_ROSTER_POSITIONS = [
  ...Array<PathwayUpslRosterProps["players"][number]["position"]>(2).fill(
    "GK",
  ),
  ...Array<PathwayUpslRosterProps["players"][number]["position"]>(6).fill(
    "DF",
  ),
  ...Array<PathwayUpslRosterProps["players"][number]["position"]>(7).fill(
    "MF",
  ),
  ...Array<PathwayUpslRosterProps["players"][number]["position"]>(7).fill(
    "FW",
  ),
];

/**
 * Phase 1 UPSL roster placeholders requested by the club. These names do not
 * represent published athletes or staff biographies. Display numbers and
 * nationalities support the approved roster-card treatment only; statistics,
 * photographs and profile destinations remain deliberately absent.
 */
export const upslRosterContent: PathwayUpslRosterProps = {
  players: DEFAULT_ROSTER_POSITIONS.map((position, index) => ({
    id: `default-player-${index + 1}`,
    name: `Player ${index + 1}`,
    position,
    squadNumber: index + 1,
    nationality: "American",
  })),
  staff: Array.from({ length: 4 }, (_, index) => ({
    id: `default-staff-${index + 1}`,
    name: `Staff ${index + 1}`,
    role: "Technical Staff",
    nationality: "American",
  })),
};

/**
 * Phase 1 UPSL fixtures placeholders. These are not published matches: the
 * club has no confirmed UPSL fixture list yet, so the opponents are numbered
 * placeholders rather than named teams, venues stay unset so every row reads
 * "Venue TBA", and no fixture carries a result — nothing here should be read
 * as a record of matches this club has played. The weekly cadence and the one
 * time-less row exist only so the fixtures page shows its real states
 * (upcoming, next, and kickoff-not-set) before Phase 2 makes the list
 * DB-backed.
 */
export const upslFixturesContent: PathwayUpslFixturesProps = {
  seasonLabel: "Fall 2026",
  fixtures: [
    {
      id: "default-fixture-1",
      date: "2026-08-29",
      time: "19:00",
      opponent: "Opponent 1",
      home: true,
    },
    {
      id: "default-fixture-2",
      date: "2026-09-05",
      time: "18:00",
      opponent: "Opponent 2",
      home: false,
    },
    {
      id: "default-fixture-3",
      date: "2026-09-12",
      time: "19:00",
      opponent: "Opponent 3",
      home: true,
    },
    {
      id: "default-fixture-4",
      date: "2026-09-19",
      time: "17:30",
      opponent: "Opponent 4",
      home: false,
    },
    {
      id: "default-fixture-5",
      date: "2026-09-26",
      opponent: "Opponent 5",
      home: true,
    },
  ],
};

/* ======================== UPSL PAYMENTS ======================== */

export const upslPaymentsContent: {
  /**
   * The Phase 1 plan composes this page from numbered-steps + spec-list. A
   * hero is supplied anyway so the page has a real <h1>; the route page may
   * use it or not.
   */
  hero: PathwayHeroProps;
  steps: PathwayNumberedStepsProps;
  specs: PathwaySpecListProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "UPSL payments",
    headlineTop: "What it costs,",
    headlineBottom: "and when.",
    sub: "An explanation of the payments involved in senior football. This page collects nothing — it exists so nobody is surprised later.",
  },
  steps: {
    eyebrow: "The process",
    heading: "Payments, in order",
    intro:
      "Each stage below happens with the club directly. There is no payment form on this site.",
    steps: [
      {
        title: "Confirm your place",
        body: "Once the club confirms a place in the squad, the payment steps below apply. Enquiring costs nothing.",
        cost: { amount: "No cost" },
      },
      {
        title: "Player registration",
        body: "Registration with the league, arranged through the club.",
        cost: { state: "tbc" },
      },
      {
        title: "Season fees",
        body: "The player contribution towards running the side across a season.",
        cost: { state: "tbc" },
      },
      {
        title: "Kit",
        body: "Playing and training kit for the season.",
        cost: { state: "tbc" },
      },
    ],
    disclaimer: NO_PAYMENT_NOTE,
  },
  specs: {
    eyebrow: "Payment details",
    heading: "How payment is handled",
    rows: [
      { label: "Collected on this site", value: "No — nothing is taken online" },
      { label: "Arranged with", value: "The club, directly" },
      { label: "Accepted methods", state: "tbc" },
      { label: "Payment schedule", state: "tbc" },
      { label: "Instalments", state: "tbc" },
      { label: "Refunds", state: "tbc" },
    ],
    note: TBC_NOTE,
  },
};

/* ============================ MERCH ============================ */

export const merchContent: PathwayMerchStoreProps = {
  collectionLabel: `Official ${CLUB_NAME} collection`,
  heading: "Make it yours!",
  intro:
    "Choose your color, explore the match and training jerseys, then open the matching DIAZA product page for current ordering details.",
  collections: [
    {
      id: "match-jerseys",
      eyebrow: "Match jerseys",
      heading: "The colors we compete in.",
      intro:
        "Two official matchday looks, each shown front and back in the supplied club artwork.",
      variants: [
        {
          id: "match-orange",
          label: "Orange",
          color: "orange",
          title: "Orange match jersey",
          description:
            "The orange match shirt pairs the academy crest and sleeve badge with navy trim and tonal Cincinnati artwork.",
          image: {
            src: "/images/pathway/match-orange-38e98dfc.webp",
            alt: "Front and back views of the orange Manu Ledesma Academy match jersey.",
          },
          cta: {
            label: "Buy Now",
            href: "https://diaza.com/collections/manu-ledesma-team/products/manu-ledesma-upsl-home-jersey",
          },
        },
        {
          id: "match-black",
          label: "Black",
          color: "black",
          title: "Black match jersey",
          description:
            "The black match shirt uses gold detailing, a split front panel and tonal patterning around the academy crest.",
          image: {
            src: "/images/pathway/match-black-33c55d27.webp",
            alt: "Front and back views of the black Manu Ledesma Academy match jersey.",
          },
          cta: {
            label: "Buy Now",
            href: "https://diaza.com/collections/manu-ledesma-team/products/manu-ledesma-upsl-away-jersey",
          },
        },
      ],
    },
    {
      id: "training-jerseys",
      eyebrow: "Training jerseys",
      heading: "Made for every session.",
      intro:
        "The training collection keeps the same two club colorways in a lighter, session-ready design.",
      variants: [
        {
          id: "training-orange",
          label: "Orange",
          color: "orange",
          title: "Orange training jersey",
          description:
            "The orange training shirt carries the academy crest over an energetic blue brush pattern, with a clean orange back.",
          image: {
            src: "/images/pathway/training-orange-6159ef5a.webp",
            alt: "Front and back views of the orange Manu Ledesma Academy training jersey.",
          },
          cta: {
            label: "Buy Now",
            href: "https://diaza.com/collections/manu-ledesma-team/products/manu-ledesma-away-training-jersey",
          },
        },
        {
          id: "training-black",
          label: "Black",
          color: "black",
          title: "Black training jersey",
          description:
            "The black training shirt sets the academy crest against blue brush detailing and a clean black back.",
          image: {
            src: "/images/pathway/training-black-f7b23c23.webp",
            alt: "Front and back views of the black Manu Ledesma Academy training jersey.",
          },
          cta: {
            label: "Buy Now",
            href: "https://diaza.com/collections/manu-ledesma-team/products/manu-ledesma-home-training-jersey",
          },
        },
      ],
    },
  ],
  note:
    "Each Buy Now button opens the matching DIAZA product page in a new tab for current sizing, availability, pricing and ordering details.",
  mentality: {
    heading: "#DIAZAMENTALITY",
    body:
      "It’s a term we came up with for our teams; it stands for family, strength, leadership, daily improvement, and conquering obstacles.",
    image: {
      src: "/images/pathway/diaza-mentality-b219504f.png",
      alt: "DIAZA",
    },
  },
};

/* ============================ ABOUT ============================ */

export const aboutContent: {
  editorial: PathwayAboutEditorialProps;
  carousel: PathwayEditorialCarouselProps;
} = {
  editorial: {
    leader: {
      heading: "From our Leader",
      body: [
        "As we welcome 2026, I feel an even deeper sense of pride and gratitude for everything this academy represents and continues to build.",
        "Year after year, we keep growing, not just in numbers, but in purpose. More boys and girls choosing this badge, our UPSL getting wider, more families becoming part of our community, and a shared love for the game that shows up every time we step on the field. That’s what truly matters.",
        "What excites me most is the spirit behind it all: the commitment to development, the respect for the game, and the belief that soccer can leave a lasting impact beyond results.",
        "We’re building something meaningful here in Cincinnati and across the region. A culture, a pathway, and a legacy that our players will carry with them wherever they go.",
        "None of this would be possible without the players, families, coaches, and supporters who continue to trust us and believe in this project. Your confidence pushes us to raise the standard every single day.",
        "Here’s to 2026! To growth, community, hard work, and the love of the game.",
        "Let’s keep building, together.",
      ],
      media: {
        src: "/images/pathway/about-leader-108a1c42.webp",
        alt: "Academy leader celebrating on the field in an orange Manu Ledesma Academy kit.",
      },
    },
  },
  carousel: {
    photos: [
      {
        src: "/images/pathway/carousel-development-pathway-0c0bbcd7.webp",
        alt: "Development Pathway poster showing Manu coaching, explaining the academy's route from youth development to adult competition.",
      },
      {
        src: "/images/pathway/carousel-looking-ahead-1a7f0175.webp",
        alt: "Looking Ahead poster showing youth players training indoors and describing plans to expand the club's competitive teams.",
      },
      {
        src: "/images/pathway/carousel-coaching-philosophy-39574da7.webp",
        alt: "Coaching Philosophy poster showing Manu with academy players and emphasizing possession, hard work and intensity.",
      },
      {
        src: "/images/pathway/carousel-consistency-515ae11b.webp",
        alt: "Blue portrait of Manu with the words Consistency above all else.",
      },
      {
        src: "/images/pathway/carousel-cincinnati-growth-48aa6132.webp",
        alt: "Cincinnati's Soccer Growth poster showing an outdoor academy session and Manu's commitment to the city's soccer culture.",
      },
      {
        src: "/images/pathway/carousel-meet-manu-d454a169.webp",
        alt: "Blue Meet Manu Ledesma portrait poster introducing a three-minute read about the academy's leader.",
      },
      {
        src: "/images/pathway/carousel-player-coach-e11e68ac.webp",
        alt: "Player-Coach poster showing Manu working with academy players and describing his connection to both roles.",
      },
      {
        src: "/images/pathway/carousel-global-journey-3664408f.webp",
        alt: "Global Journey poster showing a coach and young player and describing Manu's path from Argentina to Cincinnati.",
      },
    ],
  },
};

/* =========================== CONTACT =========================== */

export const contactContent: {
  hero: PathwayHeroProps;
  form: PathwayContactFormProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "Contact",
    headlineTop: "Start a",
    headlineBottom: "conversation.",
    sub: "Training enquiries, youth and senior football, kit, or anything else — this reaches the club directly.",
  },
  form: {
    heading: "Send us a message",
    intro: "We'll reply to the email address you give us.",
    submitLabel: "Send message",
    successMessage:
      "Thanks — your message is on its way. We'll come back to you shortly.",
    fallbackEmail: "manuledesmaacademy@gmail.com",
  },
};

/* ========================= WINTER 5V5 ========================= */

export const winter5v5Content: {
  hero: PathwayHeroProps;
  specs: PathwaySpecListProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "Winter 5v5",
    headlineTop: "Small sided.",
    headlineBottom: "All winter.",
    sub: "A winter 5v5 block for players who want to keep touching the ball through the off-season.",
    primaryCta: { label: "Register interest", href: "/contact" },
  },
  specs: {
    eyebrow: "Details",
    heading: "Winter 5v5 at a glance",
    rows: [
      { label: "Format", value: "5v5" },
      { label: "Season", value: "Winter" },
      { label: "Dates", state: "tbc" },
      { label: "Venue", state: "tbc" },
      { label: "Age groups", state: "tbc" },
      { label: "Cost", state: "tbc" },
    ],
    note: "Winter 5v5 details are still being confirmed. Register your interest and we'll come back to you as soon as dates are set.",
  },
};

/* =========================== PRIVACY =========================== */

export const privacyContent: {
  doc: PathwayLegalDocProps;
} = {
  doc: {
    eyebrow: "Legal",
    heading: "Privacy",
    intro: `How ${CLUB_NAME} handles information you send through this website.`,
    updated:
      "Draft — this policy is being finalised and will be updated before the site goes live.",
    rows: [
      {
        label: "What this covers",
        body: [
          "This policy covers information collected through this website. It does not cover information you give the club in person, by phone, or through channels the club runs elsewhere.",
        ],
      },
      {
        label: "What we collect",
        body: [
          "The contact form asks for your first name, last name, email address and message. It also offers an optional phone field. Nothing else on this site asks you for personal information.",
          "The form also carries a hidden field used only to detect automated submissions. Real visitors never fill it in.",
        ],
      },
      {
        label: "How we use it",
        body: [
          "What you send through the contact form is emailed to the club so we can reply to you. We use it to answer your enquiry and to follow it up.",
        ],
      },
      {
        label: "Sharing",
        body: [
          "We don't sell your information. It is handled by the club and by the email service used to deliver contact-form messages, and is not shared beyond that for marketing.",
        ],
      },
      {
        label: "How long we keep it",
        body: [
          "Retention periods are being confirmed and will be published here before launch.",
        ],
      },
      {
        label: "Cookies and analytics",
        body: [
          "Details of any cookies or analytics used on this site are being confirmed and will be published here before launch.",
        ],
      },
      {
        label: "Your choices",
        body: [
          "You can ask us what information we hold about you, ask us to correct it, or ask us to delete it. Send the request through the contact page and we'll deal with it.",
        ],
      },
      {
        label: "Contact",
        body: [
          "Questions about this policy can be sent through the contact page.",
        ],
      },
    ],
  },
};
