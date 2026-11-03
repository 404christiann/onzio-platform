import { describe, expect, it } from "vitest";
import { ContractError } from "../contract-error";
import { resolveActivePresentationTemplateKey } from "../club-context";

describe("published presentation assignment", () => {
  it.each(["cinematic", "heritage", "editorial"])(
    "fails closed for a retired %s assignment",
    (id) => {
      expect(() => resolveActivePresentationTemplateKey({
        schemaVersion: 1,
        template: { id, version: 1 },
      })).toThrowError(new ContractError("UNKNOWN_TENANT"));
    },
  );

  it("fails closed for a malformed assignment", () => {
    expect(() => resolveActivePresentationTemplateKey({ template: null }))
      .toThrowError(new ContractError("UNKNOWN_TENANT"));
  });
});
