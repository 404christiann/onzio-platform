/**
 * Phase 1 pathway training content.
 *
 * The selector is a neutral reusable component; this module is the one place
 * where the current tenant's labels, prices, policies, and hosted destinations
 * live until pathway content becomes database-managed. Keeping those values
 * together prevents the modal, full-page fallback, and individual CTA surfaces
 * from drifting apart.
 */

export type PathwayTrainingPass = {
  classes: 2 | 4 | 6 | 8;
  price: number;
  href: string;
};

export type PathwayUnlimitedTrainingPass = {
  durationDays: 31;
  price: number;
  href: string;
};

export type PathwayTrainingAgeGroup = {
  id: "ages-6-10" | "ages-11-14";
  label: string;
  shortLabel: string;
  session: {
    durationMinutes: 60;
    price: number;
    href: string;
  };
  passes: readonly PathwayTrainingPass[];
  unlimitedPass: PathwayUnlimitedTrainingPass;
};

export type PathwayTrainingGatewayConfig = {
  pageHref: string;
  contactHref: string;
  eyebrow: string;
  title: string;
  prompt: string;
  promptDescription: string;
  sessionDescription: string;
  passDescription: string;
  ageGroups: readonly PathwayTrainingAgeGroup[];
  visiblePolicy: readonly string[];
  policyDetails: readonly string[];
  pricingNote: string;
};

const ACUITY_PACKAGE_URL = (productId: number) =>
  `https://app.acuityscheduling.com/catalog.php?owner=35160113&action=addCart&clear=1&id=${productId}`;

export const PATHWAY_TRAINING_GATEWAY_CONFIG = {
  pageHref: "/book-training",
  contactHref: "/contact",
  eyebrow: "Training reservations",
  title: "Book training",
  prompt: "Choose the player's age group",
  promptDescription:
    "Select an age group to see the correct one-hour session and class pass pricing.",
  sessionDescription:
    "Small-group technical training focused on strength, agility, dribbling, passing, ball control, shooting, defending and position-specific development.",
  passDescription:
    "Purchase a pass first, then use the emailed booking code to reserve each class.",
  ageGroups: [
    {
      id: "ages-6-10",
      label: "Ages 6–10",
      shortLabel: "6–10",
      session: {
        durationMinutes: 60,
        price: 50,
        href: "https://app.acuityscheduling.com/schedule/db330e77/appointment/75737120",
      },
      passes: [
        { classes: 2, price: 95, href: ACUITY_PACKAGE_URL(2209687) },
        { classes: 4, price: 175, href: ACUITY_PACKAGE_URL(1939401) },
        { classes: 6, price: 250, href: ACUITY_PACKAGE_URL(1939404) },
        { classes: 8, price: 325, href: ACUITY_PACKAGE_URL(1939405) },
      ],
      unlimitedPass: {
        durationDays: 31,
        price: 400,
        href: ACUITY_PACKAGE_URL(1939406),
      },
    },
    {
      id: "ages-11-14",
      label: "Ages 11–14",
      shortLabel: "11–14",
      session: {
        durationMinutes: 60,
        price: 60,
        href: "https://app.acuityscheduling.com/schedule/db330e77/appointment/75737217",
      },
      passes: [
        { classes: 2, price: 115, href: ACUITY_PACKAGE_URL(2209685) },
        { classes: 4, price: 200, href: ACUITY_PACKAGE_URL(1939407) },
        { classes: 6, price: 275, href: ACUITY_PACKAGE_URL(1939408) },
        { classes: 8, price: 325, href: ACUITY_PACKAGE_URL(1939409) },
      ],
      unlimitedPass: {
        durationDays: 31,
        price: 450,
        href: ACUITY_PACKAGE_URL(1939411),
      },
    },
  ],
  visiblePolicy: [
    "For one player only",
    "Cannot be transferred",
    "Expires 31 days after purchase",
  ],
  policyDetails: [
    "An eight-digit booking code is emailed after purchase.",
    "Use that code when scheduling each class.",
    "Staff verify registration during check in.",
    "Only the registered player may attend.",
  ],
  pricingNote: "Final pricing confirmed on Acuity.",
} as const satisfies PathwayTrainingGatewayConfig;
