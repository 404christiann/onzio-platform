import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const mocks = vi.hoisted(() => ({
  getClubContextBySlug: vi.fn(),
  loadOpenRegistrationForm: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));

vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: mocks.getClubContextBySlug }));
vi.mock("@/lib/registration-service", () => ({ loadOpenRegistrationForm: mocks.loadOpenRegistrationForm }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import AcademyRegistrationPage from "@/components/sites/diverse-city/AcademyRegistrationPage";
import AcademyRegistrationConfirmationPage from "@/components/sites/diverse-city/AcademyRegistrationConfirmationPage";
import RegistrationConfirmation from "@/components/registration/RegistrationConfirmation";
import RegistrationPage from "@/app/%5Fclubs/[slug]/register/[formSlug]/page";
import RegistrationConfirmationPage from "@/app/%5Fclubs/[slug]/register/[formSlug]/confirmation/page";

const club = { id: "11111111-1111-4111-8111-111111111111", name: "Alpha FC", lifecycle: "active", publicAccess: "live" };
const aggregate = {
  form: { slug: "academy", title: "Academy registration", description: "Play with Alpha.", participant_mode: "adult_only", waiver_text: "I agree." },
  fields: [],
  prices: [{ id: "33333333-3333-4333-8333-333333333333", label: "Player fee", amount_cents: 0 }],
};
const request = (checkout?: string) => ({ params: Promise.resolve({ slug: "alpha", formSlug: "academy" }), searchParams: Promise.resolve({ checkout }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClubContextBySlug.mockResolvedValue(club);
  mocks.loadOpenRegistrationForm.mockResolvedValue(aggregate);
});

describe.each(["academy@1", "editorial@1", "clubhouse@1", null])("public registration page behavior for %s", (presentationTemplateKey) => {
  beforeEach(() => {
    mocks.getClubContextBySlug.mockResolvedValue({ ...club, presentationTemplateKey });
  });

  it.each([undefined, "cancelled"])("keeps exact page markup identical to neutral rendering for checkout=%s", async (checkout) => {
    const markup = renderToStaticMarkup(await RegistrationPage(request(checkout)));
    mocks.getClubContextBySlug.mockResolvedValue({ ...club, presentationTemplateKey: null });
    expect(markup).toBe(renderToStaticMarkup(await RegistrationPage(request(checkout))));
  });

  it("selects the Academy page composition only for the verified Academy tenant", async () => {
    const page = await RegistrationPage(request());
    expect(page.type).toBe(presentationTemplateKey === "academy@1" ? AcademyRegistrationPage : "section");
  });

  it("uses the corresponding confirmation page while retaining one shared status implementation", async () => {
    const page = await RegistrationConfirmationPage({ params: request().params, searchParams: Promise.resolve({ token: "test-status-token" }) });
    expect(page.type).toBe(presentationTemplateKey === "academy@1" ? AcademyRegistrationConfirmationPage : RegistrationConfirmation);
  });
  it("loads only the resolved tenant's form and shows its title, description, and shared registration CTA", async () => {
    const markup = renderToStaticMarkup(await RegistrationPage(request()));
    expect(mocks.getClubContextBySlug).toHaveBeenCalledWith("alpha");
    expect(mocks.loadOpenRegistrationForm).toHaveBeenCalledWith(club.id, "academy");
    expect(markup).toContain(">Alpha FC</p>");
    expect(markup).toContain(">Academy registration</h1>");
    expect(markup).toContain(">Play with Alpha.</p>");
    expect(markup).toContain("Register now</button>");
    expect(markup).not.toContain("Checkout was cancelled");
  });

  it("preserves the cancelled-checkout status without hiding the registration CTA", async () => {
    const markup = renderToStaticMarkup(await RegistrationPage(request("cancelled")));
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Checkout was cancelled. Your registration was not completed.");
    expect(markup).toContain("Register now</button>");
  });

  it("shows stopped-form copy without offering another submission", async () => {
    mocks.loadOpenRegistrationForm.mockRejectedValue(new ContractError("REGISTRATION_FORM_CLOSED"));
    const page = await RegistrationPage(request());
    expect(page.type).toBe(presentationTemplateKey === "academy@1" ? AcademyRegistrationPage : "section");
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("Registration closed</h1>");
    expect(markup).toContain("This registration is no longer accepting new submissions. Contact the club if you need help.");
    expect(markup).not.toContain("Register now");
    mocks.getClubContextBySlug.mockResolvedValue({ ...club, presentationTemplateKey: null });
    expect(markup).toBe(renderToStaticMarkup(await RegistrationPage(request())));
  });

  it.each([
    { lifecycle: "onboarding", publicAccess: "preview" },
    { lifecycle: "active", publicAccess: "suspended" },
    { lifecycle: "archived", publicAccess: "live" },
  ])("does not load forms for an unavailable club $lifecycle/$publicAccess", async (state) => {
    mocks.getClubContextBySlug.mockResolvedValue({ ...club, presentationTemplateKey, ...state });
    await expect(RegistrationPage(request())).rejects.toThrow("NOT_FOUND");
    expect(mocks.loadOpenRegistrationForm).not.toHaveBeenCalled();
  });

  it("keeps missing forms indistinguishable through the route's not-found response", async () => {
    mocks.loadOpenRegistrationForm.mockRejectedValue(new ContractError("REGISTRATION_FORM_NOT_FOUND"));
    await expect(RegistrationPage(request())).rejects.toThrow("NOT_FOUND");
  });

  it("keeps confirmation tenant-resolution failure at the not-found boundary", async () => {
    mocks.getClubContextBySlug.mockRejectedValue(new ContractError("UNKNOWN_TENANT"));
    await expect(RegistrationConfirmationPage({ params: request().params, searchParams: Promise.resolve({ token: "test-status-token" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("continues rendering confirmation while payment status is polled by the shared component", async () => {
    const markup = renderToStaticMarkup(await RegistrationConfirmationPage({ params: request().params, searchParams: Promise.resolve({ token: "test-status-token" }) }));
    expect(markup).toContain("Confirming registration</h1>");
    expect(markup).toContain('aria-label="Confirmation pending"');
    mocks.getClubContextBySlug.mockResolvedValue({ ...club, presentationTemplateKey: null });
    expect(markup).toBe(renderToStaticMarkup(await RegistrationConfirmationPage({ params: request().params, searchParams: Promise.resolve({ token: "test-status-token" }) })));
  });
});
