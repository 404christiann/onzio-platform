import { failContract } from "@/lib/contract-error";

const HOSTNAME_MAX_LENGTH = 253;
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function normalizeHostname(input: string): string {
  if (
    !input ||
    input !== input.trim() ||
    /[\s/@\\?#]/.test(input) ||
    input.includes("://")
  ) {
    failContract("INVALID_HOSTNAME");
  }

  let candidate = input.toLowerCase();
  const trailingDotIndex = candidate.endsWith(".")
    ? candidate.length - 1
    : -1;

  if (trailingDotIndex >= 0) {
    candidate = candidate.slice(0, trailingDotIndex);
  }

  const portMatch = candidate.match(/^(.*):(\d+)$/);
  if (portMatch) {
    const [, host, rawPort] = portMatch;
    const port = Number(rawPort);
    if (!isLocalHostname(host) || port < 1 || port > 65535) {
      failContract("INVALID_HOSTNAME");
    }
    candidate = host;
  } else if (candidate.includes(":") && candidate !== "[::1]") {
    failContract("INVALID_HOSTNAME");
  }

  if (
    !candidate ||
    candidate.length > HOSTNAME_MAX_LENGTH ||
    candidate.startsWith(".") ||
    candidate.endsWith(".")
  ) {
    failContract("INVALID_HOSTNAME");
  }

  if (candidate === "[::1]") return candidate;

  const labels = candidate.split(".");
  if (labels.some((label) => !LABEL_PATTERN.test(label))) {
    failContract("INVALID_HOSTNAME");
  }

  return candidate;
}
