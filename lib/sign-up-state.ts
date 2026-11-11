// ADMIN-RE-12b: a program's or tryout's sign-up state is worked out from its
// sign-up way and its date, never set by hand (design decision 0003; glossary
// "Taking sign-ups", "Not taking sign-ups yet", "Closed", "Hidden from your
// website"). The public site, the classic previews and the reimagined list all
// read it from here. The database applies the same rule to new sign-ups in
// onzio_private.registration_form_accepting
// (20261110180000_programs_tryouts_sign_up_state.sql).

export type SignUpState = "taking" | "not-yet" | "closed" | "hidden";

/** How families sign up, in the order the public page picks one. */
export type SignUpWay = "form" | "link" | "contact" | "none";

export type SignUpWayInput = Readonly<{
  /** A sign-up form is linked and open. A draft or closed form doesn't count. */
  hasOpenForm: boolean;
  /** A link with both a button label and a safe address. */
  hasLink: boolean;
  /** The owner chose "They contact you". */
  byContact: boolean;
}>;

export function signUpWay(input: SignUpWayInput): SignUpWay {
  if (input.hasOpenForm) return "form";
  if (input.hasLink) return "link";
  if (input.byContact) return "contact";
  return "none";
}

export type TryoutSignUpInput = SignUpWayInput &
  Readonly<{
    hidden: boolean;
    /** The stored status: only 'closed' (closed by the owner) still matters. */
    status: string;
    eventDate: string | null;
    staysOpenAfterDate: boolean;
  }>;

export type TryoutSignUp = Readonly<{
  state: SignUpState;
  way: SignUpWay;
  /** Closed because the date passed (the list says "Closed after Sat, Mar 7" and offers Reopen). */
  closedByDate: boolean;
}>;

/**
 * A tryout closes by itself the day after its date, in the club's time zone
 * (`today` is lib/club-time.ts clubToday). A tryout with no date never closes
 * by itself; a reopened one stays open until its date changes.
 */
export function tryoutSignUp(input: TryoutSignUpInput, today: string): TryoutSignUp {
  const way = signUpWay(input);
  if (input.hidden) return { state: "hidden", way, closedByDate: false };
  if (input.status === "closed") return { state: "closed", way, closedByDate: false };
  if (input.eventDate && input.eventDate < today && !input.staysOpenAfterDate) {
    return { state: "closed", way, closedByDate: true };
  }
  return { state: way === "none" ? "not-yet" : "taking", way, closedByDate: false };
}

export type ProgramSignUpInput = SignUpWayInput &
  Readonly<{
    /** onzio.programs.status: 'hidden' takes the page off the website. */
    status: string;
    signUpsClosed: boolean;
  }>;

export type ProgramSignUp = Readonly<{ state: SignUpState; way: SignUpWay }>;

/** Hiding a program also stops its sign-ups (group 2 decision 10). */
export function programSignUp(input: ProgramSignUpInput): ProgramSignUp {
  const way = signUpWay(input);
  if (input.status === "hidden") return { state: "hidden", way };
  if (input.signUpsClosed) return { state: "closed", way };
  return { state: way === "none" ? "not-yet" : "taking", way };
}

/**
 * The word the Tryouts page prints on a card. It used to be the stored status;
 * now it follows the state, so "Open" never shows without a way to sign up.
 */
export function publicTryoutStatus(state: SignUpState): "upcoming" | "open" | "closed" {
  if (state === "taking") return "open";
  if (state === "not-yet") return "upcoming";
  return "closed";
}

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const withCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatPrice(amountCents: number): string {
  if (amountCents <= 0) return "Free";
  return amountCents % 100 === 0
    ? wholeDollars.format(amountCents / 100)
    : withCents.format(amountCents / 100);
}

/**
 * The price families see, from the sign-up form (decision 0004): one price
 * "$25", several "From $25", only free options "Free". A form whose cheapest
 * option is free but which has paid ones still reads "Free" first: "From $0"
 * would say nothing. Null when the form has no active price.
 */
export function formPriceText(amountsCents: readonly number[]): string | null {
  const amounts = [...new Set(amountsCents.filter((amount) => Number.isFinite(amount) && amount >= 0))].sort(
    (a, b) => a - b,
  );
  if (amounts.length === 0) return null;
  if (amounts.length === 1 || amounts[0] === 0) return formatPrice(amounts[0]);
  return `From ${formatPrice(amounts[0])}`;
}

/**
 * Tryouts read by date, soonest first, on the website and in the admin (group
 * 2 decision 13). Tryouts without a date follow, in the order they were added.
 */
export function compareTryoutsByDate(
  a: Readonly<{ eventDate: string | null; sortOrder: number }>,
  b: Readonly<{ eventDate: string | null; sortOrder: number }>,
): number {
  if (a.eventDate && b.eventDate && a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? -1 : 1;
  if (a.eventDate && !b.eventDate) return -1;
  if (!a.eventDate && b.eventDate) return 1;
  return a.sortOrder - b.sortOrder;
}
