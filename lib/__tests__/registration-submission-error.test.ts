import { describe, expect, it } from "vitest";
import { registrationSubmissionErrorMessage } from "@/lib/registration-submission-error";

describe("registration submission error copy", () => {
  it("makes a form closed after the modal opened explicit to the visitor", () => {
    expect(registrationSubmissionErrorMessage("REGISTRATION_FORM_CLOSED"))
      .toBe("This registration form is closed.");
  });

  it("retains generic safe error formatting for other submission failures", () => {
    expect(registrationSubmissionErrorMessage("REGISTRATION_FORM_NOT_FOUND"))
      .toBe("Unable to continue: registration form not found.");
  });
});
