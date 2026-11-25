import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeGraphic } from "@/lib/media-processing";
import { validateMediaUpload } from "@/lib/media-validation";
import { expectContractError } from "../helpers/contract";

/** A transparent PNG graphic of the given size; a solid fill keeps even 6000px files small. */
async function graphicPng(width: number, height: number, sixteenBit = false): Promise<Buffer> {
  let image = sharp({ create: { width, height, channels: 4, background: { r: 200, g: 30, b: 40, alpha: 0.5 } } });
  if (sixteenBit) image = image.toColourspace("rgb16");
  return image.png().toBuffer();
}

function graphicMetadata(bytes: Buffer) {
  return { fileName: "crest.png", mimeType: "image/png", size: bytes.length, kind: "graphic" as const };
}

describe("graphic uploads larger than 3000px", () => {
  it("accepts a 4000px PNG graphic", async () => {
    const bytes = await graphicPng(4000, 1000);
    await expect(validateMediaUpload({ bytes, metadata: graphicMetadata(bytes) })).resolves.toMatchObject({
      safe: true,
      width: 4000,
      height: 1000,
      hasAlpha: true,
    });
  });

  it("downscales a 4000px PNG graphic to fit 2400px and keeps alpha", async () => {
    const bytes = await graphicPng(4000, 2000);
    const result = await normalizeGraphic(bytes);
    expect(result).toMatchObject({ width: 2400, height: 1200, hasAlpha: true, metadataStripped: true });
    const output = await sharp(result.bytes).metadata();
    expect(output).toMatchObject({ width: 2400, height: 1200, hasAlpha: true });
  });

  it("accepts a 6000 x 6000 graphic (36 MP) and downscales it", async () => {
    const bytes = await graphicPng(6000, 6000);
    await expect(validateMediaUpload({ bytes, metadata: graphicMetadata(bytes) })).resolves.toMatchObject({ width: 6000, height: 6000 });
    await expect(normalizeGraphic(bytes)).resolves.toMatchObject({ width: 2400, height: 2400 });
  });

  it("leaves a graphic already within 2400px at its size", async () => {
    const bytes = await graphicPng(1200, 800);
    await expect(normalizeGraphic(bytes)).resolves.toMatchObject({ width: 1200, height: 800 });
  });

  it("accepts a 16-bit PNG graphic", async () => {
    const bytes = await graphicPng(3200, 400, true);
    await expect(validateMediaUpload({ bytes, metadata: graphicMetadata(bytes) })).resolves.toMatchObject({ width: 3200 });
    await expect(normalizeGraphic(bytes)).resolves.toMatchObject({ width: 2400, height: 300, hasAlpha: true });
  });

  it("still refuses a graphic wider than 6000px", async () => {
    const bytes = await graphicPng(6001, 10);
    await expectContractError(() => validateMediaUpload({ bytes, metadata: graphicMetadata(bytes) }), "DIMENSIONS_TOO_LARGE");
    await expectContractError(() => normalizeGraphic(bytes), "DIMENSIONS_TOO_LARGE");
  });

  it("reports a graphic over the pixel limit as too many pixels, not unreadable", async () => {
    const bytes = await graphicPng(7000, 7000);
    await expectContractError(() => validateMediaUpload({ bytes, metadata: graphicMetadata(bytes) }), "DIMENSIONS_TOO_LARGE");
  });

  it("reports a PNG whose pixel data is cut short as unreadable", async () => {
    const whole = await graphicPng(256, 256);
    const idat = whole.indexOf(Buffer.from("IDAT"));
    const cut = whole.subarray(0, idat + 4 + Math.floor(whole.readUInt32BE(idat - 4) / 2));
    await expectContractError(() => normalizeGraphic(cut), "CORRUPT_IMAGE");
  });
});
