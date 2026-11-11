import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import {
  compareTryoutsByDate,
  formPriceText,
  programSignUp,
  publicTryoutStatus,
  signUpWay,
  tryoutSignUp,
} from "@/lib/sign-up-state";
import { mapTryout, type HydratedTryout } from "@/lib/queries";
import type { PublicRegistrationForm } from "@/lib/registration-public";

// ADMIN-RE-12b: the sign-up state follows the sign-up way and the date
// (decision 0003); the public price comes from the form (decision 0004).

const none = { hasOpenForm: false, hasLink: false, byContact: false };
const tryout = { hidden: false, status: "open", eventDate: "2026-03-07", staysOpenAfterDate: false, ...none };

describe("signUpWay", () => {
  it("picks a form over a link over contacting the club, as the public page does", () => {
    expect(signUpWay({ hasOpenForm: true, hasLink: true, byContact: true })).toBe("form");
    expect(signUpWay({ hasOpenForm: false, hasLink: true, byContact: true })).toBe("link");
    expect(signUpWay({ hasOpenForm: false, hasLink: false, byContact: true })).toBe("contact");
    expect(signUpWay(none)).toBe("none");
  });
});

describe("tryoutSignUp", () => {
  it("is not taking sign-ups yet with no way chosen, and taking with one", () => {
    expect(tryoutSignUp(tryout, "2026-03-01").state).toBe("not-yet");
    expect(tryoutSignUp({ ...tryout, hasLink: true }, "2026-03-01").state).toBe("taking");
    expect(tryoutSignUp({ ...tryout, byContact: true }, "2026-03-01").state).toBe("taking");
  });

  it("stays open on its date and closes by itself the day after", () => {
    const withForm = { ...tryout, hasOpenForm: true };
    expect(tryoutSignUp(withForm, "2026-03-07")).toEqual({ state: "taking", way: "form", closedByDate: false });
    expect(tryoutSignUp(withForm, "2026-03-08")).toEqual({ state: "closed", way: "form", closedByDate: true });
  });

  it("never closes by itself without a date, and stays open once reopened", () => {
    expect(tryoutSignUp({ ...tryout, eventDate: null, hasLink: true }, "2030-01-01").state).toBe("taking");
    expect(tryoutSignUp({ ...tryout, staysOpenAfterDate: true, hasLink: true }, "2026-04-01").state).toBe("taking");
  });

  it("treats the old Upcoming like Open: only the owner's Closed is kept", () => {
    expect(tryoutSignUp({ ...tryout, status: "upcoming", hasLink: true }, "2026-03-01").state).toBe("taking");
    expect(tryoutSignUp({ ...tryout, status: "closed", hasLink: true }, "2026-03-01")).toEqual({
      state: "closed",
      way: "link",
      closedByDate: false,
    });
  });

  it("puts hidden before every other state", () => {
    expect(tryoutSignUp({ ...tryout, hidden: true, status: "closed", hasLink: true }, "2026-04-01").state).toBe("hidden");
  });
});

describe("programSignUp", () => {
  it("hides, closes, then follows the way", () => {
    expect(programSignUp({ status: "hidden", signUpsClosed: false, ...none, hasOpenForm: true }).state).toBe("hidden");
    expect(programSignUp({ status: "active", signUpsClosed: true, ...none, hasOpenForm: true }).state).toBe("closed");
    expect(programSignUp({ status: "active", signUpsClosed: false, ...none, hasOpenForm: true }).state).toBe("taking");
    expect(programSignUp({ status: "active", signUpsClosed: false, ...none }).state).toBe("not-yet");
  });
});

describe("publicTryoutStatus", () => {
  it("prints Open only when families can sign up", () => {
    expect(publicTryoutStatus("taking")).toBe("open");
    expect(publicTryoutStatus("not-yet")).toBe("upcoming");
    expect(publicTryoutStatus("closed")).toBe("closed");
  });
});

describe("formPriceText", () => {
  it("reads one price, several prices and free forms the way families see them", () => {
    expect(formPriceText([2500])).toBe("$25");
    expect(formPriceText([4000, 2500])).toBe("From $25");
    expect(formPriceText([2500, 2500])).toBe("$25");
    expect(formPriceText([0])).toBe("Free");
    expect(formPriceText([0, 2500])).toBe("Free");
    expect(formPriceText([2550])).toBe("$25.50");
    expect(formPriceText([125_000, 140_000])).toBe("From $1,250");
    expect(formPriceText([99_999_999])).toBe("$999,999.99");
    expect(formPriceText([])).toBeNull();
  });
});

describe("compareTryoutsByDate", () => {
  it("puts the soonest first and tryouts without a date last, in the order added", () => {
    const rows = [
      { id: "none-b", eventDate: null, sortOrder: 3 },
      { id: "oct", eventDate: "2026-10-04", sortOrder: 0 },
      { id: "none-a", eventDate: null, sortOrder: 1 },
      { id: "mar", eventDate: "2026-03-07", sortOrder: 2 },
    ];
    expect(rows.sort(compareTryoutsByDate).map((row) => row.id)).toEqual(["mar", "oct", "none-a", "none-b"]);
  });
});

describe("mapTryout (the public card)", () => {
  const row = {
    id: "88888888-8888-4888-8888-888888888801",
    club_id: "11111111-1111-4111-8111-111111111111",
    program_id: null,
    status: "upcoming",
    eyebrow: "",
    headline: "Spring tryouts",
    intro: "",
    hero_media_asset_id: null,
    eligibility_copy: "",
    what_to_expect_copy: "",
    preparation_copy: "",
    event_date: "2026-03-07",
    location: "Riverside Fields",
    cost_text: "Contact the club",
    cta_label: "Sign up",
    registration_href: "https://example.test/tryouts",
    registration_form_id: null,
    closed_message: "See you next season.",
    sort_order: 0,
    hidden: false,
    sign_up_by_contact: false,
    stays_open_after_date: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } satisfies HydratedTryout;
  const form: PublicRegistrationForm = {
    slug: "spring",
    title: "Spring tryouts 2027",
    description: "",
    participantMode: "minor_only",
    waiverText: "I agree.",
    fields: [],
    prices: [
      { id: "a", label: "Player", amountCents: 4000 },
      { id: "b", label: "Sibling", amountCents: 2500 },
    ],
  };

  it("keeps the link and prints Open while the date has not passed", () => {
    const card = mapTryout(row, "club@example.test", undefined, "2026-03-07");
    expect(card.status).toBe("open");
    expect(card.closedByDate).toBe(false);
    expect(card.action).toEqual({ kind: "registration", label: "Sign up", href: "https://example.test/tryouts" });
    expect(card.costText).toBe("Contact the club");
  });

  it("drops the form and link the day after, leaving only Contact the club", () => {
    const card = mapTryout({ ...row, registration_form_id: "f" }, "club@example.test", form, "2026-03-08");
    expect(card.status).toBe("closed");
    expect(card.closedByDate).toBe(true);
    expect(card.nativeRegistration).toBeNull();
    expect(card.action).toEqual({ kind: "contact", label: "Contact the club", href: "mailto:club@example.test" });
    expect(card.costText).toBe("Contact the club");
  });

  it("shows the form's price as the cost while the form takes sign-ups", () => {
    const card = mapTryout({ ...row, registration_form_id: "f" }, "club@example.test", form, "2026-03-01");
    expect(card.nativeRegistration?.form.slug).toBe("spring");
    expect(card.costText).toBe("From $25");
  });

  it("prints Upcoming, not Open, when there is no way to sign up", () => {
    const card = mapTryout({ ...row, status: "open", registration_href: "", cta_label: "" }, "", undefined, "2026-03-01");
    expect(card.status).toBe("upcoming");
    expect(card.action).toBeNull();
  });
});
