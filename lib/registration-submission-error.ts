/** Converts stable public registration errors into visitor-facing copy. */
export function registrationSubmissionErrorMessage(error: string): string {
  if (error === "REGISTRATION_FORM_CLOSED") {
    return "This registration form is closed.";
  }
  return `Unable to continue: ${error.replaceAll("_", " ").toLowerCase()}.`;
}
