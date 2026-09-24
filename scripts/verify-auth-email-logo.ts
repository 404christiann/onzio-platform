import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LOGO_PATH = "/images/onzio/onzio-black-logo-no-bg-trimmed.png";
const PUBLISHED_ORIGIN = "https://onzio-platform.vercel.app";

type Options = {
  root?: string;
  fetchImage?: typeof fetch;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Release gate: the email's public image must be the exact approved local PNG. */
export async function verifyAuthEmailLogo({
  root = process.cwd(),
  fetchImage = fetch,
}: Options = {}): Promise<string> {
  const template = await readFile(
    resolve(root, "supabase/templates/magic_link.html"),
    "utf8",
  );
  const logoTag = [...template.matchAll(/<img\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .find((tag) => /\balt="Onzio"/.test(tag));
  const src = logoTag?.match(/\bsrc="([^"]+)"/)?.[1];
  if (!src) throw new Error("OTP email template has no Onzio logo image URL");

  const url = new URL(src);
  if (url.origin !== PUBLISHED_ORIGIN || url.pathname !== LOGO_PATH) {
    throw new Error(`OTP email logo must use ${PUBLISHED_ORIGIN}${LOGO_PATH}`);
  }

  const local = await readFile(resolve(root, `public${LOGO_PATH}`));
  if (local.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("The approved local email logo is not a PNG");
  }

  let response: Response;
  try {
    response = await fetchImage(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`Could not reach the OTP email logo at ${url}`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`OTP email logo is not public: HTTP ${response.status} at ${url}`);
  }
  if (!/^image\/png(?:;|$)/i.test(response.headers.get("content-type") ?? "")) {
    throw new Error(`OTP email logo is not served as PNG at ${url}`);
  }

  const published = new Uint8Array(await response.arrayBuffer());
  if (sha256(published) !== sha256(local)) {
    throw new Error(`Published OTP email logo differs from approved local PNG at ${url}`);
  }

  return url.toString();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyAuthEmailLogo()
    .then((url) => console.log(`OTP email logo is published and matches: ${url}`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
