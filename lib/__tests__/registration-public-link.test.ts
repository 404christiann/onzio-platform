import { describe, expect, it } from "vitest";
import { registrationPublicUrl } from "@/lib/registration-public-link";

describe("registration public links", () => {
  it("uses the verified primary domain for hosted admin aliases", () => {
    expect(
      registrationPublicUrl({
        currentOrigin: "https://admin-alias.example.com",
        primaryDomain: "club.example.com",
        formSlug: "fall-tryouts-2026",
      }),
    ).toBe("https://club.example.com/register/fall-tryouts-2026");
  });

  it("keeps a tenant localhost origin and development port", () => {
    expect(
      registrationPublicUrl({
        currentOrigin: "http://rose-city.localhost:3007",
        primaryDomain: "club.example.com",
        formSlug: "fall-tryouts-2026",
      }),
    ).toBe("http://rose-city.localhost:3007/register/fall-tryouts-2026");
  });
});
