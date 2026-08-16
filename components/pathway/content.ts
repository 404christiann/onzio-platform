import type { PathwayCta } from "@/components/pathway/PathwaySection";
import type { PathwayHeroProps } from "@/components/pathway/PathwayHero";
import type { PathwayRailProps } from "@/components/pathway/PathwayRail";
import type { PathwaySplitFeatureProps } from "@/components/pathway/PathwaySplitFeature";
import type { PathwayInvertedFeatureProps } from "@/components/pathway/PathwayInvertedFeature";
import type { PathwayFeatureGridProps } from "@/components/pathway/PathwayFeatureGrid";
import type { PathwayMissionProps } from "@/components/pathway/PathwayMission";
import type { PathwaySpecListProps } from "@/components/pathway/PathwaySpecList";
import type { PathwayNumberedStepsProps } from "@/components/pathway/PathwayNumberedSteps";
import type { PathwayPriceCardsProps } from "@/components/pathway/PathwayPriceCards";
import type { PathwayPartnerStripProps } from "@/components/pathway/PathwayPartnerStrip";
import type { PathwayContactFormProps } from "@/components/pathway/PathwayContactForm";
import type { PathwayLegalDocProps } from "@/components/pathway/PathwayLegalDoc";

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
 * 2. Nothing else is invented. Prices, dates, venues, age groups, squad
 *    details, staff names and partner names are not known at Phase 1, so
 *    they render as first-class TBC rows and neutral placeholders rather
 *    than plausible-looking fiction that someone downstream might mistake
 *    for confirmed fact. Positioning copy describing what a stage *is* is
 *    fine; a claim about when, where or how much is not.
 *
 * Every CTA points at /contact. Phase 1 has no scheduler and no commerce
 * backend, so the contact form is the site's only real action — including
 * for "Book training", matching the nav CTA's own routing.
 */

export const CLUB_NAME = "Manu Ledesma Academy";
export const LEAGUE_NAME = "United Premier Soccer League";

const CONTACT_CTA: PathwayCta = { label: "Get in touch", href: "/contact" };
const BOOK_TRAINING_CTA: PathwayCta = { label: "Book training", href: "/contact" };

/** Shared line for any section whose figures are informational only. */
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
 * them into these props. This module carries only words, per the Phase 1
 * rule above. The sort_order convention is:
 *
 *   0 — leader photo (Manu at the goal), Home leader band
 *   1 — strength & agility photo, expect-grid column 1
 *   2 — foot-skills photo, expect-grid column 2
 *   3 — teamwork photo, expect-grid column 3
 *   4 — squad team photo, Home hero background (behind the opening band)
 */
export const HOME_PHOTO_SLOTS = {
  leader: 0,
  agility: 1,
  footSkills: 2,
  teamwork: 3,
  heroBackground: 4,
} as const;

export const homeContent: {
  hero: PathwayHeroProps;
  leader: PathwayInvertedFeatureProps;
  rail: PathwayRailProps;
  expect: PathwayFeatureGridProps;
  partners: PathwayPartnerStripProps;
  mission: PathwayMissionProps;
} = {
  hero: {
    variant: "centered",
    eyebrow: CLUB_NAME,
    headlineTop: "One club.",
    headlineBottom: "Every stage of the game.",
    sub: `Technical training, youth football, senior football and a route into the ${LEAGUE_NAME} — all under one badge.`,
    primaryCta: BOOK_TRAINING_CTA,
    secondaryCta: { label: "See the pathway", href: "/academy" },
  },
  // The leader/bio band. Facts are drawn from the club's own published
  // material: Manu's journey from Quilmes, Argentina through an
  // international professional career (including FC Cincinnati) to
  // Cincinnati, and the academy's offer of elite training, expert coaching
  // and mentorship. This is a real person's professional bio — reword only
  // with care.
  leader: {
    eyebrow: "Who we are",
    heading: CLUB_NAME,
    body: [
      "We're dedicated to nurturing the next generation of soccer players through elite training, expert coaching and mentorship — building technical skill, tactical understanding and physical fitness, and shaping character along the way.",
    ],
    subsections: [
      {
        heading: "Our leader: Manu Ledesma",
        body: [
          "Manu's journey began in Quilmes, Argentina, and carried him through an international professional career — including his years with FC Cincinnati — before Cincinnati became home. He brings the lessons of that career to every session, committed to mentoring young players in the game and beyond it.",
        ],
      },
      {
        heading: "What we offer",
        bullets: [
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
    mediaSide: "end",
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
        title: "Strength & Agility Training",
        body: "Footwork drills, plyometrics, reaction work and balance training that sharpen how quickly a player changes direction. The return is speed, coordination and stability — and a body better protected against injury.",
        mediaCaption: "Agility session photography to come.",
      },
      {
        title: "Leveled Up Foot Skills",
        body: "Dribbling, passing, receiving, juggling, toe touches — repetition that puts the ball under a player's command, even under pressure. Better ball handling builds confidence, and confidence changes performance.",
        mediaCaption: "Foot-skills photography to come.",
      },
      {
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
  feature: PathwaySplitFeatureProps;
  specs: PathwaySpecListProps;
  packages: PathwayPriceCardsProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "Academy",
    headlineTop: "Start with",
    headlineBottom: "the technical work.",
    sub: "The academy is the first stage of the pathway, and where players build the individual foundation everything after it rests on.",
    primaryCta: BOOK_TRAINING_CTA,
  },
  feature: {
    eyebrow: "Inside the programme",
    heading: "Technique first, then everything else.",
    body: [
      "Academy sessions are built around the ball. Players work on the parts of the game they own individually — the touch, the turn, the pass, the decision — before any of it has to survive a match.",
      "Groups are kept small enough that a coach can see every repetition, and players are pushed at the level they're actually at rather than the level their age group suggests.",
    ],
    bullets: [
      "Ball mastery and first touch",
      "Receiving and passing under pressure",
      "1v1 attacking and defending",
      "Finishing and decision-making",
    ],
    primaryCta: BOOK_TRAINING_CTA,
    mediaCaption: "Academy session photography to come.",
    mediaSide: "end",
  },
  specs: {
    eyebrow: "Details",
    heading: "Academy at a glance",
    rows: [
      { label: "Focus", value: "Individual and small-group technical development" },
      { label: "Stage", value: `Entry point to the ${CLUB_NAME} pathway` },
      { label: "Age groups", state: "tbc" },
      { label: "Session times", state: "tbc" },
      { label: "Venue", state: "tbc" },
      { label: "Season dates", state: "tbc" },
    ],
    note: TBC_NOTE,
  },
  packages: {
    eyebrow: "Training packages",
    heading: "Ways to train with us",
    cards: [
      {
        name: "Single session",
        description:
          "One academy session, for players trying the programme for the first time.",
        price: { state: "tbc" },
      },
      {
        name: "Session block",
        description:
          "A run of sessions booked together, for players committing to a stretch of work.",
        price: { state: "tbc" },
      },
      {
        name: "Small group",
        description:
          "A closed session for a small group of players who want to train together.",
        price: { state: "tbc" },
      },
    ],
    note: NO_PAYMENT_NOTE,
    cta: { label: "Ask about packages", href: "/contact" },
  },
};

/* ======================== BOOK TRAINING ======================== */

export const bookTrainingContent: {
  hero: PathwayHeroProps;
  feature: PathwaySplitFeatureProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "Book training",
    headlineTop: "Tell us about",
    headlineBottom: "the player.",
    sub: "There's no online booking system yet. Send us a message and we'll come back to you with availability, times and cost.",
    primaryCta: { label: "Send a message", href: "/contact" },
  },
  feature: {
    eyebrow: "How it works",
    heading: "One message, one reply.",
    body: [
      "Booking is handled by a person, not a calendar widget. You tell us who the player is and what they're looking for, and we reply with what we can offer.",
      "The more you can tell us up front, the fewer messages it takes to get a session in the diary.",
    ],
    bullets: [
      "What the player wants to work on",
      "Their age group",
      "Rough availability across the week",
    ],
    primaryCta: { label: "Send a message", href: "/contact" },
    mediaCaption: "Training photography to come.",
    mediaSide: "end",
  },
};

/* ========================= YOUTH CLUB ========================= */

export const youthClubContent: {
  hero: PathwayHeroProps;
  feature: PathwaySplitFeatureProps;
  specs: PathwaySpecListProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "Youth Club",
    headlineTop: "From training",
    headlineBottom: "into a team.",
    sub: "The youth club is the second stage of the pathway — where academy work turns into competitive team football.",
    primaryCta: CONTACT_CTA,
  },
  feature: {
    eyebrow: "Youth Club",
    heading: "Team football, same standards.",
    body: [
      "Playing in a team changes what technical work is for. The touch has to hold up with an opponent on it, the pass has to arrive at the right moment, and the decision has to be made before there's time to think about it.",
      "Youth club players keep the academy habits and apply them across a season, in a squad, against other clubs.",
    ],
    bullets: [
      "Competitive fixtures across a season",
      "Positional work inside a team shape",
      "A route on to the senior club",
    ],
    primaryCta: CONTACT_CTA,
    mediaCaption: "Youth Club matchday photography to come.",
    mediaSide: "start",
  },
  specs: {
    eyebrow: "Details",
    heading: "Youth Club at a glance",
    rows: [
      { label: "Focus", value: "Competitive team football" },
      { label: "Stage", value: "Second stage of the pathway" },
      { label: "Age groups", state: "tbc" },
      { label: "Training nights", state: "tbc" },
      { label: "Home venue", state: "tbc" },
      { label: "League and division", state: "tbc" },
    ],
    note: TBC_NOTE,
  },
};

/* ========================= SENIOR CLUB ========================= */

export const seniorClubContent: {
  hero: PathwayHeroProps;
  specs: PathwaySpecListProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "Senior Club",
    headlineTop: "The last step",
    headlineBottom: "before the league.",
    sub: `The senior club is the adult end of the pathway, and the stage that leads into our ${LEAGUE_NAME} football.`,
    primaryCta: CONTACT_CTA,
  },
  specs: {
    eyebrow: "Details",
    heading: "Senior Club at a glance",
    rows: [
      { label: "Stage", value: "Adult football, third stage of the pathway" },
      { label: "Leads into", value: LEAGUE_NAME },
      { label: "Squad", state: "tbc" },
      { label: "Training nights", state: "tbc" },
      { label: "Home venue", state: "tbc" },
      { label: "Trial dates", state: "tbc" },
    ],
    // The senior club is the least settled stage of the pathway, so this
    // page carries the most TBC rows by some distance. That is the honest
    // state of the club, not an unfinished page.
    note: "The senior club is still being set up. Everything marked TBC is genuinely undecided — we'd rather leave it open than publish something we'd have to take back.",
  },
};

/* ============================ UPSL ============================ */

export const upslContent: {
  hero: PathwayHeroProps;
  feature: PathwayInvertedFeatureProps;
  steps: PathwayNumberedStepsProps;
} = {
  hero: {
    variant: "left",
    eyebrow: LEAGUE_NAME,
    headlineTop: "The pathway",
    headlineBottom: "has a destination.",
    sub: `UPSL is the adult league our senior football is built around — the end of a route that starts with a first academy session.`,
    primaryCta: CONTACT_CTA,
  },
  feature: {
    eyebrow: "The league",
    heading: "Where the pathway leads.",
    body: [
      "UPSL is adult football: adult standards, adult opposition, a full season. It is the reason the earlier stages of the pathway are built the way they are.",
      "A player who comes through the academy, the youth club and the senior club arrives here having been coached by the same club the whole way, rather than starting again at every level.",
    ],
    primaryCta: { label: "Talk to us about the senior route", href: "/contact" },
    mediaCaption: "UPSL matchday photography to come.",
    mediaSide: "end",
  },
  steps: {
    eyebrow: "Entry",
    heading: "How entry works",
    intro:
      "The steps below explain the process end to end. They're here to be read, not paid — no payment is collected anywhere on this site.",
    steps: [
      {
        title: "Get in touch",
        body: "Send us a message telling us where you are as a player and what you're looking for. We'll reply with what the current route in looks like.",
        cost: { amount: "No cost" },
      },
      {
        title: "Trial",
        body: "Come and train with the group so the coaching staff can see you play and you can see how the club works.",
        cost: { state: "tbc" },
      },
      {
        title: "Registration",
        body: "Squad registration with the league, completed with the club before you can be named in a matchday squad.",
        cost: { state: "tbc" },
      },
      {
        title: "Season fees",
        body: "The player contribution towards running the senior side across the season.",
        cost: { state: "tbc" },
      },
    ],
    disclaimer:
      "Figures are informational. Anything due is arranged with the club directly — see the UPSL payments page for the full explanation.",
  },
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

export const merchContent: {
  hero: PathwayHeroProps;
  kits: PathwayPriceCardsProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "Merch",
    headlineTop: "Wear",
    headlineBottom: "the badge.",
    sub: "Club kit and training wear for players, families and anyone who follows the pathway.",
    primaryCta: { label: "Ask about kit", href: "/contact" },
  },
  kits: {
    eyebrow: "Club kit",
    heading: "What's coming",
    intro:
      "The club store isn't open yet. These are the kits being put together; prices and availability are published here once they're confirmed.",
    cards: [
      {
        name: "Training kit",
        description: "Training top and shorts in club colours.",
        price: { state: "tbc" },
      },
      {
        name: "Matchday kit",
        description: "The playing kit worn by club teams.",
        price: { state: "tbc" },
      },
      {
        name: "Travel wear",
        description: "Outerwear for cold sessions and travelling to fixtures.",
        price: { state: "tbc" },
      },
      {
        name: "Supporters",
        description: "Everyday items for families and supporters of the club.",
        price: { state: "tbc" },
      },
    ],
    note: "Nothing is sold on this page. Once kit is confirmed you'll be able to order it through the club.",
    cta: { label: "Ask about kit", href: "/contact" },
  },
};

/* ============================ ABOUT ============================ */

export const aboutContent: {
  hero: PathwayHeroProps;
  feature: PathwaySplitFeatureProps;
} = {
  hero: {
    variant: "left",
    eyebrow: "About",
    headlineTop: "Built around",
    headlineBottom: "one pathway.",
    sub: `${CLUB_NAME} is a single club with four stages, from a player's first technical session to adult league football.`,
    primaryCta: CONTACT_CTA,
  },
  feature: {
    eyebrow: "The idea",
    heading: "One club, not four.",
    body: [
      "Most players meet a new badge every time they move up — a different academy, a different youth side, a different senior club. Every move means starting again with coaches who don't know them.",
      `${CLUB_NAME} is built the other way round. The academy, the youth club, the senior club and our ${LEAGUE_NAME} football are stages of the same club, so a player who joins at the start can go all the way through without ever leaving.`,
      "That's the whole idea, and every page on this site is a stage of it.",
    ],
    primaryCta: CONTACT_CTA,
    mediaCaption: "Club photography to come.",
    mediaSide: "end",
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
          "The contact form asks for your first name, last name, email address and message. Nothing else on this site asks you for personal information.",
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
