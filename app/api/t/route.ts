import { createPublicClient } from "@/lib/supabase-server";
import { buildPageEvent, MAX_BEACON_BYTES } from "@/lib/telemetry/beacon";
import { clubHasTelemetry } from "@/lib/telemetry/entitlement";
import { ingestSecret, signPayload } from "@/lib/telemetry/ingest";
import { createFixedWindowLimiter } from "@/lib/telemetry/rate-limit";

// TELEMETRY-01 public page beacon. It uses the anon public client only (no
// cookies, no service-role key) and writes through the single security-definer
// function behind onzio.record_page_event. The anon key is public, so that
// function accepts only calls signed with TELEMETRY_INGEST_SECRET; this route
// is the one place that holds it. It always answers 204 so callers learn
// nothing about why an event was or was not kept.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The database gives each network a floor of 120 events a minute and lets it go on while its own count
// plus the club's stays under 1,320, so a network takes at most half of the club's remaining headroom:
// 660 alone on a quiet club (a stadium's shared Wi-Fi), less as the club fills, never under 120.
// This best-effort per-instance limit sits just under that 660 ceiling. It still sits far above the 120
// floor, so it never cuts a busy shared network short; it only sheds a flood before the database, and
// the database stays the real limit.
const NETWORK_MAX_PER_MINUTE = 600;
const limiter = createFixedWindowLimiter({ limit: NETWORK_MAX_PER_MINUTE, windowMs: 60_000, maxKeys: 10_000 });
// Heartbeats (time on page) have their own per-network limiter and never spend the one above, because
// the database gives them their own club-wide budget and keeps them off the network caps: otherwise
// the heartbeats of a stadium's fans (one network) would starve that network's page views. 1,200 a
// minute is 300 visible tabs behind one network at one heartbeat per 15 s.
const HEARTBEAT_NETWORK_MAX_PER_MINUTE = 1200;
const heartbeatLimiter = createFixedWindowLimiter({
  limit: HEARTBEAT_NETWORK_MAX_PER_MINUTE,
  windowMs: 60_000,
  maxKeys: 10_000,
});

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  // Fail closed: without the signing key the database would reject every call.
  const signingKey = ingestSecret();
  if (!signingKey) return noContent();

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BEACON_BYTES) return noContent();

  let bodyText: string;
  try {
    bodyText = (await request.text()).slice(0, MAX_BEACON_BYTES + 1);
  } catch {
    return noContent();
  }

  const decision = buildPageEvent({ headers: request.headers, bodyText });
  if (decision.kind === "drop") return noContent();
  // Early skip for clubs without the paid add-on (cached). The database
  // function is the real gate and checks again.
  if (!(await clubHasTelemetry(decision.clubId))) return noContent();
  // Keyed on the network, not ip + user agent, so rotating user agents from one machine shares a budget.
  // An IPv6 caller is keyed on its /48, so rotating /64 addresses inside one block shares one too;
  // an IPv4 caller on its address.
  const networkKey = decision.event.wideNetworkMaterial ?? decision.event.networkMaterial;
  // Heartbeats use only the heartbeat limiter; every other type uses the 600 limiter.
  const routeLimiter = decision.event.type === "heartbeat" ? heartbeatLimiter : limiter;
  if (!routeLimiter.allow(`${decision.clubId}:${networkKey}`)) return noContent();

  // Serialise once and sign exactly that text; the database verifies the same bytes.
  const payload = JSON.stringify(decision.event);
  const signature = signPayload(decision.clubId, payload, signingKey);

  try {
    await createPublicClient()
      .schema("onzio")
      .rpc("record_page_event", { p_club_id: decision.clubId, p_payload: payload, p_signature: signature });
  } catch {
    // Telemetry never fails a page.
  }
  return noContent();
}
