export const CLUB_IDS = {
  alpha: "11111111-1111-4111-8111-111111111111",
  bravo: "22222222-2222-4222-8222-222222222222",
  charlie: "33333333-3333-4333-8333-333333333333",
} as const;

export const USER_IDS = {
  ownerAal2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  ownerAal1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  adminAal2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  removed: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  unaffiliated: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  multiClub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
} as const;

export const clubs = {
  alpha: {
    id: CLUB_IDS.alpha,
    slug: "alpha",
    name: "Alpha FC",
    primaryDomain: "alpha-onzio.vercel.app",
    lifecycle: "active",
    publicAccess: "live",
    tier: "pro",
  },
  bravo: {
    id: CLUB_IDS.bravo,
    slug: "bravo",
    name: "Bravo United",
    primaryDomain: "bravo-onzio.vercel.app",
    lifecycle: "onboarding",
    publicAccess: "preview",
    tier: "starter",
  },
  // A second active, publicly live club used to prove that tenant access is
  // independent of the dormant legacy tier column.
  charlie: {
    id: CLUB_IDS.charlie,
    slug: "charlie",
    name: "Charlie Athletic",
    primaryDomain: "charlie-onzio.vercel.app",
    lifecycle: "active",
    publicAccess: "live",
    tier: "starter",
  },
} as const;

export const domains = [
  {
    clubId: CLUB_IDS.alpha,
    hostname: "alpha-onzio.vercel.app",
    primary: true,
    verified: true,
    environment: "production",
  },
  {
    clubId: CLUB_IDS.alpha,
    hostname: "www.alphafc.example",
    primary: false,
    verified: true,
    environment: "production",
  },
  {
    clubId: CLUB_IDS.bravo,
    hostname: "bravo-onzio.vercel.app",
    primary: true,
    verified: true,
    environment: "production",
  },
] as const;

export const memberships = [
  {
    userId: USER_IDS.ownerAal2,
    clubId: CLUB_IDS.alpha,
    role: "owner",
    status: "active",
    aal: "aal2",
  },
  {
    userId: USER_IDS.ownerAal1,
    clubId: CLUB_IDS.alpha,
    role: "owner",
    status: "active",
    aal: "aal1",
  },
  {
    userId: USER_IDS.adminAal2,
    clubId: CLUB_IDS.alpha,
    role: "admin",
    status: "active",
    aal: "aal2",
  },
  {
    userId: USER_IDS.removed,
    clubId: CLUB_IDS.alpha,
    role: "admin",
    status: "removed",
    aal: "aal2",
  },
  {
    userId: USER_IDS.multiClub,
    clubId: CLUB_IDS.alpha,
    role: "admin",
    status: "active",
    aal: "aal2",
  },
  {
    userId: USER_IDS.multiClub,
    clubId: CLUB_IDS.bravo,
    role: "owner",
    status: "active",
    aal: "aal2",
  },
] as const;

export const accessStates = {
  onboarding: { lifecycle: "onboarding", status: null, paidThrough: null },
  active: { lifecycle: "active", status: "active", paidThrough: "2026-08-31T00:00:00Z" },
  trialing: { lifecycle: "active", status: "trialing", paidThrough: "2026-08-05T00:00:00Z" },
  grace: { lifecycle: "active", status: "canceled", paidThrough: "2026-07-23T00:00:00Z" },
  suspended: { lifecycle: "active", status: "canceled", paidThrough: "2026-07-01T00:00:00Z" },
  archived: { lifecycle: "archived", status: "active", paidThrough: "2026-08-31T00:00:00Z" },
} as const;
