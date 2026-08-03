import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubs, USER_IDS } from "../fixtures/entities";
import { expectContractError } from "../helpers/contract";
import {
  addClubMembership,
  removeClubMembership,
} from "@/lib/operator/manage-membership";
import { inviteClubMember } from "@/lib/operator/invite-club-member";

const OPERATOR_TOKEN = "verified-operator-token";
const operatorDependencies = {
  now: () => new Date("2026-08-03T18:00:00Z"),
  verifyOperatorAccessToken: async () => ({
    sub: USER_IDS.ownerAal2,
    aal: "aal2",
    amr: [{ method: "totp", timestamp: 1785780000 }],
  }),
};

describe("operator-only membership contract", () => {
  beforeEach(() => {
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", USER_IDS.ownerAal2);
  });

  it.each([
    () =>
      addClubMembership({
        clubId: clubs.alpha.id,
        operatorAccessToken: OPERATOR_TOKEN,
        userId: USER_IDS.unaffiliated,
        role: "admin",
        invokedFromApplicationRoute: true,
      }),
    () =>
      removeClubMembership({
        clubId: clubs.alpha.id,
        operatorAccessToken: OPERATOR_TOKEN,
        userId: USER_IDS.adminAal2,
        invokedFromApplicationRoute: true,
      }),
  ])("rejects membership mutation from an application route", async (action) => {
    await expectContractError(action, "OPERATOR_ONLY");
  });

  it("derives a new-member invitation callback from the verified tenant domain", async () => {
    await expect(
      inviteClubMember({
        clubId: clubs.alpha.id,
        operatorAccessToken: OPERATOR_TOKEN,
        email: "new-owner@approved.example",
        role: "owner",
        environment: "staging",
        dependencies: {
          ...operatorDependencies,
          verifiedPrimaryHostname: "alpha-onzio-staging.vercel.app",
        },
      }),
    ).resolves.toMatchObject({
      role: "owner",
      callbackUrl: "https://alpha-onzio-staging.vercel.app/admin/auth/callback",
      authUserCreated: true,
      codeSent: true,
      membershipActive: true,
      audited: true,
    });
  });

  it("rejects invitation and membership creation from an application route", async () => {
    await expectContractError(
      () =>
        inviteClubMember({
          clubId: clubs.alpha.id,
          operatorAccessToken: OPERATOR_TOKEN,
          email: "new-owner@approved.example",
          role: "owner",
          environment: "staging",
          invokedFromApplicationRoute: true,
        }),
      "OPERATOR_ONLY",
    );
  });

  it("rejects an allowlisted operator below aal2", async () => {
    await expectContractError(
      () =>
        inviteClubMember({
          clubId: clubs.alpha.id,
          operatorAccessToken: OPERATOR_TOKEN,
          email: "new-owner@approved.example",
          role: "owner",
          environment: "staging",
          dependencies: {
            ...operatorDependencies,
            verifyOperatorAccessToken: async () => ({
              sub: USER_IDS.ownerAal2,
              aal: "aal1",
              amr: [{ method: "otp", timestamp: 1785780000 }],
            }),
          },
        }),
      "OPERATOR_AAL2_REQUIRED",
    );
  });

  it("rejects an operator whose TOTP step-up is older than two hours", async () => {
    await expectContractError(
      () =>
        inviteClubMember({
          clubId: clubs.alpha.id,
          operatorAccessToken: OPERATOR_TOKEN,
          email: "new-owner@approved.example",
          role: "owner",
          environment: "staging",
          dependencies: {
            ...operatorDependencies,
            verifyOperatorAccessToken: async () => ({
              sub: USER_IDS.ownerAal2,
              aal: "aal2",
              amr: [{ method: "totp", timestamp: 1785771000 }],
            }),
          },
        }),
      "OPERATOR_SESSION_EXPIRED",
    );
  });
});
