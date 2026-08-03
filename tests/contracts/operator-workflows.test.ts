import { describe, expect, it } from "vitest";
import { clubs, USER_IDS } from "../fixtures/entities";
import { expectContractError } from "../helpers/contract";
import {
  addClubMembership,
  removeClubMembership,
} from "@/lib/operator/manage-membership";
import { inviteClubMember } from "@/lib/operator/invite-club-member";
import { recoverMemberMfa } from "@/lib/operator/mfa-recovery";

describe("operator-only membership and MFA recovery contract", () => {
  it.each([
    () =>
      addClubMembership({
        clubId: clubs.alpha.id,
        actorId: USER_IDS.ownerAal2,
        userId: USER_IDS.unaffiliated,
        role: "admin",
        invokedFromApplicationRoute: true,
      }),
    () =>
      removeClubMembership({
        clubId: clubs.alpha.id,
        actorId: USER_IDS.ownerAal2,
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
        actorId: USER_IDS.ownerAal2,
        email: "new-owner@approved.example",
        role: "owner",
        environment: "staging",
        dependencies: { verifiedPrimaryHostname: "alpha-onzio-staging.vercel.app" },
      }),
    ).resolves.toMatchObject({
      role: "owner",
      callbackUrl: "https://alpha-onzio-staging.vercel.app/admin/auth/callback",
      authUserCreated: true,
      invitationRequested: true,
      membershipActive: true,
      audited: true,
    });
  });

  it("rejects invitation and membership creation from an application route", async () => {
    await expectContractError(
      () =>
        inviteClubMember({
          clubId: clubs.alpha.id,
          actorId: USER_IDS.ownerAal2,
          email: "new-owner@approved.example",
          role: "owner",
          environment: "staging",
          invokedFromApplicationRoute: true,
        }),
      "OPERATOR_ONLY",
    );
  });

  it("requires recorded manual identity verification for MFA recovery", async () => {
    await expect(
      recoverMemberMfa({
        clubId: clubs.alpha.id,
        userId: USER_IDS.adminAal2,
        actorId: USER_IDS.ownerAal2,
        identityVerified: false as true,
        verificationReference: "manual-check-123",
      }),
    ).rejects.toMatchObject({ code: "INVALID_OPERATOR_INPUT" });
  });

  it("rejects MFA recovery from an application route", async () => {
    await expectContractError(
      () =>
        recoverMemberMfa({
          clubId: clubs.alpha.id,
          userId: USER_IDS.adminAal2,
          actorId: USER_IDS.ownerAal2,
          identityVerified: true,
          verificationReference: "manual-check-123",
          invokedFromApplicationRoute: true,
        }),
      "OPERATOR_ONLY",
    );
  });
});
