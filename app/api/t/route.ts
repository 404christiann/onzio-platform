import { createPublicClient } from "@/lib/supabase-server";
import { buildPageEvent, MAX_BEACON_BYTES } from "@/lib/telemetry/beacon";
import { clubHasTelemetry } from "@/lib/telemetry/entitlement";
import { createFixedWindowLimiter } from "@/lib/telemetry/rate-limit";

// TELEMETRY-01 public page beacon. It uses the anon public client only (no
// cookies, no service-role key) and writes through the single security-definer
// function behind onzio.record_page_event. It always answers 204 so callers
// learn nothing about why an event was or was not kept.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createFixedWindowLimiter({ limit: 120, windowMs: 60_000, maxKeys: 10_000 });

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
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
  if (!limiter.allow(`${decision.clubId}:${decision.event.visitorMaterial}`)) return noContent();

  try {
    await createPublicClient()
      .schema("onzio")
      .rpc("record_page_event", { p_club_id: decision.clubId, p_event: decision.event });
  } catch {
    // Telemetry never fails a page.
  }
  return noContent();
}
