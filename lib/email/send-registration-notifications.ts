import {
  loadRegistrationNotificationData,
  updateRegistrationEmailDelivery,
} from "@/lib/registration-service";
import {
  getRegistrationEmailClient,
  getRegistrationEmailConfig,
  type RegistrationEmailClient,
} from "@/lib/email/resend-client";
import {
  buildOwnerRegistrationEmail,
  buildRegistrantRegistrationEmail,
  type RegistrationEmail,
} from "@/lib/email/registration-templates";

type DeliveryStatus = "sent" | "failed" | "skipped";
type DeliveryResult = {
  status: DeliveryStatus;
  messageId?: string;
  error?: string;
};

function deliveryError(...errors: Array<string | undefined>): string | null {
  const unique = Array.from(
    new Set(errors.filter((error): error is string => Boolean(error))),
  );
  return unique.join(" ") || null;
}

export type RegistrationNotificationResult = {
  registrant: DeliveryResult & { recipients: string[] };
  owner: DeliveryResult & { recipients: string[] };
};

/**
 * Notification delivery never changes payment truth. If loading or final status
 * persistence fails before sendRegistrationNotifications can record its own
 * outcome, retain a visible admin recovery signal by registration ID.
 */
export async function recordRegistrationNotificationFailure(
  registrationId: string,
  error: unknown,
): Promise<void> {
  console.error("Registration notification delivery failed", { registrationId, error });
  const message = error instanceof Error
    ? error.message
    : "Registration notification delivery failed";
  try {
    await updateRegistrationEmailDelivery({
      registrationId,
      registrantStatus: "failed",
      adminStatus: "failed",
      error: message,
    });
  } catch (statusError) {
    console.error("Registration notification failure status write failed", {
      registrationId,
      error: statusError,
    });
  }
}

async function deliver(
  client: RegistrationEmailClient,
  from: string,
  to: string | string[],
  email: RegistrationEmail,
): Promise<DeliveryResult> {
  try {
    const result = await client.emails.send({
      from,
      to,
      ...email,
    });
    if (result.error) return { status: "failed", error: result.error.message };
    if (!result.data?.id) {
      return { status: "failed", error: "Resend returned no message ID." };
    }
    return { status: "sent", messageId: result.data.id };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 200) : "Email delivery failed",
    };
  }
}

export async function sendRegistrationNotifications(
  registrationId: string,
  dependencies?: { client?: RegistrationEmailClient },
): Promise<RegistrationNotificationResult> {
  const data = await loadRegistrationNotificationData(registrationId);
  const config = getRegistrationEmailConfig();
  if (!config) {
    const result: RegistrationNotificationResult = {
      registrant: {
        recipients: [data.registrantEmail],
        status: "skipped",
        error: "Resend is not configured.",
      },
      owner: {
        recipients: data.ownerEmails,
        status: "skipped",
        error: data.ownerEmails.length > 0
          ? "Resend is not configured."
          : "No active club owner email found.",
      },
    };
    await updateRegistrationEmailDelivery({
      registrationId,
      registrantStatus: "skipped",
      adminStatus: "skipped",
      error: deliveryError(result.registrant.error, result.owner.error),
    });
    return result;
  }

  const client = dependencies?.client ?? getRegistrationEmailClient(config.apiKey);
  const registrant = await deliver(
    client,
    config.from,
    data.registrantEmail,
    buildRegistrantRegistrationEmail(data),
  );
  const owner = data.ownerEmails.length === 0
    ? { status: "skipped" as const, error: "No active club owner email found." }
    : await deliver(
      client,
      config.from,
      data.ownerEmails,
      buildOwnerRegistrationEmail(data),
    );
  await updateRegistrationEmailDelivery({
    registrationId,
    registrantStatus: registrant.status,
    adminStatus: owner.status,
    error: deliveryError(registrant.error, owner.error),
  });
  const result: RegistrationNotificationResult = {
    registrant: { ...registrant, recipients: [data.registrantEmail] },
    owner: { ...owner, recipients: data.ownerEmails },
  };
  console.info("Registration notification delivery completed", {
    registrationId,
    registrantStatus: result.registrant.status,
    registrantMessageId: result.registrant.messageId ?? null,
    adminStatus: result.owner.status,
    adminMessageId: result.owner.messageId ?? null,
  });
  return result;
}
