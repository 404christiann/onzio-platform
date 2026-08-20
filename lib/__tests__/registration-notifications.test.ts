import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/registration-service", () => ({
  loadRegistrationNotificationData: mocks.load,
  updateRegistrationEmailDelivery: mocks.update,
}));

import {
  recordRegistrationNotificationFailure,
  sendRegistrationNotifications,
} from "@/lib/email/send-registration-notifications";

const data = {
  registrationId: "11111111-1111-4111-8111-111111111111",
  clubId: "22222222-2222-4222-8222-222222222222",
  clubName: "Alpha FC",
  participantName: "Alex Player",
  formTitle: "Academy",
  formDescription: "Tuesday evening training at Alpha Field.",
  registrantEmail: "family@example.test",
  ownerEmails: ["owner@example.test"],
  priceLabel: "Player fee",
  amountCents: 12500,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(data);
  mocks.update.mockResolvedValue(undefined);
  mocks.send.mockResolvedValue({ data: { id: "email_test" }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("registration notification delivery", () => {
  it("sends separate notifications to the registrant and live-resolved owners", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_safe");
    vi.stubEnv(
      "REGISTRATION_EMAIL_FROM",
      "Onzio Registrations <registrations@auth.onziofutbol.com>",
    );
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await sendRegistrationNotifications(data.registrationId, {
      client: { emails: { send: mocks.send } } as any,
    });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][0]).toEqual(expect.objectContaining({
      from: "Onzio Registrations <registrations@auth.onziofutbol.com>",
      to: data.registrantEmail,
    }));
    expect(mocks.send.mock.calls[1][0]).toEqual(expect.objectContaining({
      from: "Onzio Registrations <registrations@auth.onziofutbol.com>",
      to: data.ownerEmails,
    }));
    for (const [message] of mocks.send.mock.calls) {
      const { to: _recipient, ...content } = message;
      expect(JSON.stringify(content)).not.toContain("family@example.test");
      expect(JSON.stringify(content)).not.toContain(data.registrationId);
    }
    expect(result).toEqual({
      registrant: {
        recipients: [data.registrantEmail],
        status: "sent",
        messageId: "email_test",
      },
      owner: {
        recipients: data.ownerEmails,
        status: "sent",
        messageId: "email_test",
      },
    });
    expect(mocks.update).toHaveBeenCalledWith({
      registrationId: data.registrationId,
      registrantStatus: "sent",
      adminStatus: "sent",
      error: null,
    });
    expect(consoleInfo).toHaveBeenCalledWith(
      "Registration notification delivery completed",
      expect.objectContaining({
        registrantStatus: "sent",
        registrantMessageId: "email_test",
        adminStatus: "sent",
        adminMessageId: "email_test",
      }),
    );
  });

  it("marks both notifications skipped when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await sendRegistrationNotifications(data.registrationId);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      registrantStatus: "skipped",
      adminStatus: "skipped",
      error: "Resend is not configured.",
    }));
  });

  it("does not attempt the owner notification if no active owner email exists", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_safe");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.load.mockResolvedValue({ ...data, ownerEmails: [] });
    await sendRegistrationNotifications(data.registrationId, {
      client: { emails: { send: mocks.send } } as any,
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      registrantStatus: "sent",
      adminStatus: "skipped",
    }));
  });

  it("records an explicit Resend API error without throwing or changing payment truth", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_safe");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.send
      .mockResolvedValueOnce({
        data: null,
        error: { message: "The auth.onziofutbol.com domain is not verified." },
      })
      .mockResolvedValueOnce({ data: { id: "email_owner" }, error: null });

    const result = await sendRegistrationNotifications(data.registrationId, {
      client: { emails: { send: mocks.send } } as any,
    });

    expect(result.registrant).toEqual({
      recipients: [data.registrantEmail],
      status: "failed",
      error: "The auth.onziofutbol.com domain is not verified.",
    });
    expect(result.owner).toEqual({
      recipients: data.ownerEmails,
      status: "sent",
      messageId: "email_owner",
    });
    expect(mocks.update).toHaveBeenCalledWith({
      registrationId: data.registrationId,
      registrantStatus: "failed",
      adminStatus: "sent",
      error: "The auth.onziofutbol.com domain is not verified.",
    });
  });

  it("marks both statuses failed when notification data cannot load before delivery", async () => {
    const error = new Error("notification data unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.load.mockRejectedValueOnce(error);

    await expect(sendRegistrationNotifications(data.registrationId)).rejects.toThrow(error);
    await recordRegistrationNotificationFailure(data.registrationId, error);

    expect(mocks.update).toHaveBeenCalledWith({
      registrationId: data.registrationId,
      registrantStatus: "failed",
      adminStatus: "failed",
      error: "notification data unavailable",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Registration notification delivery failed",
      expect.objectContaining({ registrationId: data.registrationId, error }),
    );
  });

  it("does not throw when the best-effort failure-status write also fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.update.mockRejectedValueOnce(new Error("status write unavailable"));

    await expect(
      recordRegistrationNotificationFailure(data.registrationId, new Error("load unavailable")),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Registration notification failure status write failed",
      expect.objectContaining({ registrationId: data.registrationId }),
    );
  });
});
