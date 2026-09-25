import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifyAuthEmailLogo } from "@/scripts/verify-auth-email-logo";

const logoPath = resolve("public/images/onzio/onzio-black-logo-no-bg-trimmed.png");

describe("OTP email logo release gate", () => {
  it("accepts the exact approved PNG served from the template URL", async () => {
    const local = await readFile(logoPath);
    const fetchImage = vi.fn<typeof fetch>(async () =>
      new Response(local, { status: 200, headers: { "content-type": "image/png" } }),
    );

    await expect(verifyAuthEmailLogo({ fetchImage })).resolves.toBe(
      "https://ioalthwsdrlzrubomrow.supabase.co/storage/v1/object/public/onzio-branding/email/onzio-black-wordmark-v1.png",
    );
    expect(fetchImage).toHaveBeenCalledOnce();
  });

  it("blocks an unpublished image and a different image", async () => {
    const unpublished = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));
    await expect(verifyAuthEmailLogo({ fetchImage: unpublished })).rejects.toThrow(
      "OTP email logo is not public: HTTP 404",
    );

    const different = vi.fn<typeof fetch>(async () =>
      new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    await expect(verifyAuthEmailLogo({ fetchImage: different })).rejects.toThrow(
      "differs from approved local PNG",
    );
  });

  it("blocks non-image responses", async () => {
    const fetchImage = vi.fn<typeof fetch>(async () =>
      new Response("<html>Missing</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    await expect(verifyAuthEmailLogo({ fetchImage })).rejects.toThrow(
      "not served as PNG",
    );
  });
});
