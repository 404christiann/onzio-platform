import type { RegistrationNotificationData } from "@/lib/registration-service";
import { formatRegistrationUsd } from "@/lib/registration-currency";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function multilineHtml(value: string): string {
  return escapeHtml(value).replace(/\r\n?|\n/g, "<br>");
}

const containerStyle =
  "font-family:Arial,sans-serif;line-height:1.6;color:#18181b;max-width:600px;margin:0 auto";
const headingStyle = "font-size:28px;line-height:1.2;margin:0 0 24px";
const detailStyle = "margin:0 0 12px";

export type RegistrationEmail = {
  subject: string;
  text: string;
  html: string;
};

export function buildRegistrantRegistrationEmail(
  data: RegistrationNotificationData,
): RegistrationEmail {
  const subject = `${data.clubName}: registration confirmed`;
  const price = `${data.priceLabel} — ${formatRegistrationUsd(data.amountCents)}`;
  const descriptionText = data.formDescription
    ? `\n\nProgram details:\n${data.formDescription}`
    : "";
  const descriptionHtml = data.formDescription
    ? `<p style="${detailStyle}"><strong>Program details</strong><br>${multilineHtml(data.formDescription)}</p>`
    : "";
  return {
    subject,
    text: `Hi ${data.participantName},\n\nYour registration is confirmed.\n\nForm: ${data.formTitle}\nClub: ${data.clubName}\nSelection: ${price}${descriptionText}`,
    html: `<div style="${containerStyle}"><h1 style="${headingStyle}">Registration confirmed</h1><p>Hi <strong>${escapeHtml(data.participantName)}</strong>,</p><p>Your registration is confirmed.</p><p style="${detailStyle}"><strong>Form:</strong> ${escapeHtml(data.formTitle)}<br><strong>Club:</strong> ${escapeHtml(data.clubName)}<br><strong>Selection:</strong> ${escapeHtml(price)}</p>${descriptionHtml}</div>`,
  };
}

export function buildOwnerRegistrationEmail(
  data: RegistrationNotificationData,
): RegistrationEmail {
  const subject = `${data.clubName}: new paid registration`;
  const price = `${data.priceLabel} — ${formatRegistrationUsd(data.amountCents)}`;
  const descriptionText = data.formDescription
    ? `\n\nProgram details:\n${data.formDescription}`
    : "";
  const descriptionHtml = data.formDescription
    ? `<p style="${detailStyle}"><strong>Program details</strong><br>${multilineHtml(data.formDescription)}</p>`
    : "";
  const rosterInstruction =
    `Open Onzio Admin → Registrations and select “${data.formTitle}” to review its paid roster.`;
  return {
    subject,
    text: `A new registration has been paid.\n\nRegistrant: ${data.participantName}\nForm: ${data.formTitle}\nClub: ${data.clubName}\nSelection: ${price}${descriptionText}\n\nReview the roster: ${rosterInstruction}`,
    html: `<div style="${containerStyle}"><h1 style="${headingStyle}">New paid registration</h1><p>A new registration has been paid.</p><p style="${detailStyle}"><strong>Registrant:</strong> ${escapeHtml(data.participantName)}<br><strong>Form:</strong> ${escapeHtml(data.formTitle)}<br><strong>Club:</strong> ${escapeHtml(data.clubName)}<br><strong>Selection:</strong> ${escapeHtml(price)}</p>${descriptionHtml}<p><strong>Review the roster:</strong> ${escapeHtml(rosterInstruction)}</p></div>`,
  };
}
