import { Resend } from "resend";

export type RegistrationEmailClient = Pick<Resend, "emails">;

export function getRegistrationEmailClient(apiKey: string): RegistrationEmailClient {
  return new Resend(apiKey);
}

export function getRegistrationEmailConfig(): {
  apiKey: string;
  from: string;
} | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    from:
      process.env.REGISTRATION_EMAIL_FROM?.trim() ||
      "Onzio Registrations <registrations@onzio.app>",
  };
}
