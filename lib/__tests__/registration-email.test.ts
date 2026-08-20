import { describe, expect, it } from "vitest";
import {
  buildOwnerRegistrationEmail,
  buildRegistrantRegistrationEmail,
} from "@/lib/email/registration-templates";

const data = {
  registrationId: "11111111-1111-4111-8111-111111111111",
  clubId: "22222222-2222-4222-8222-222222222222",
  clubName: "Alpha <FC>",
  participantName: "Alex <Player>",
  formTitle: "Academy & Camp",
  formDescription: "Training: Tuesdays & Thursdays\nLocation: Field <One>",
  registrantEmail: "family@example.test",
  ownerEmails: ["owner@example.test"],
  priceLabel: "Player 'A'",
  amountCents: 12500,
};

describe("registration email templates", () => {
  it("builds a detailed registrant confirmation with safely escaped HTML", () => {
    const email = buildRegistrantRegistrationEmail(data);
    expect(email.text).toContain("Hi Alex <Player>");
    expect(email.text).toContain("Form: Academy & Camp");
    expect(email.text).toContain("Club: Alpha <FC>");
    expect(email.text).toContain("Player 'A' — $125.00");
    expect(email.text).toContain(data.formDescription);
    expect(email.text).toContain("$125.00");
    expect(email.html).toContain("Alpha &lt;FC&gt;");
    expect(email.html).toContain("Alex &lt;Player&gt;");
    expect(email.html).toContain("Academy &amp; Camp");
    expect(email.html).toContain("Tuesdays &amp; Thursdays<br>Location: Field &lt;One&gt;");
    expect(email.html).not.toContain("<Player>");
    expect(email.text).not.toContain("sandbox");
    expect(JSON.stringify(email)).not.toContain("family@example.test");
    expect(JSON.stringify(email)).not.toContain(data.registrationId);
  });

  it("gives owners the paid-registration details and a roster action", () => {
    const email = buildOwnerRegistrationEmail(data);
    expect(email.subject).toContain("new paid registration");
    expect(email.text).toContain("Registrant: Alex <Player>");
    expect(email.text).toContain("Form: Academy & Camp");
    expect(email.text).toContain("Club: Alpha <FC>");
    expect(email.text).toContain("Player 'A' — $125.00");
    expect(email.text).toContain(data.formDescription);
    expect(email.text).toContain(
      "Open Onzio Admin → Registrations and select “Academy & Camp” to review its paid roster.",
    );
    expect(email.html).toContain("Alex &lt;Player&gt;");
    expect(email.html).toContain("Academy &amp; Camp");
    expect(email.html).toContain("Field &lt;One&gt;");
    expect(email.text).not.toContain("sandbox");
    expect(JSON.stringify(email)).not.toContain("family@example.test");
    expect(JSON.stringify(email)).not.toContain(data.registrationId);
  });

  it("omits the optional program-details section when description is empty", () => {
    const email = buildRegistrantRegistrationEmail({ ...data, formDescription: "" });
    expect(email.text).not.toContain("Program details");
    expect(email.html).not.toContain("Program details");
  });
});
