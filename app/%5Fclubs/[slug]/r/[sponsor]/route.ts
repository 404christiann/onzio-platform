import { after } from "next/server";
import { roseCityPreviewHost } from "@/lib/rose-city-preview";
import { createPublicClient } from "@/lib/supabase-server";
import { normalizeHostname } from "@/lib/tenant";
import { buildClickEvent } from "@/lib/telemetry/beacon";
import { shouldRecordClick } from "@/lib/telemetry/click-policy";
import { clubHasTelemetry } from "@/lib/telemetry/entitlement";
import { ingestSecret, signPayload } from "@/lib/telemetry/ingest";

// TELEMETRY-02: sponsor click redirect, GET /r/<sponsorId>. Middleware rewrites the public path to
// /_clubs/<slug>/r/<id> after verified tenant resolution and sets x-onzio-club-id. The club comes only
// from that header; the [slug] segment and the URL are ignored for tenancy. The click is recorded after
// the response is sent and can never delay or break the redirect.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function requestHost(headers: Headers): string | null {
  try {
    return normalizeHostname(headers.get("host") ?? "");
  } catch {
    return null;
  }
}

async function recordClick(request: Request, sponsorId: string): Promise<void> {
  try {
    const signingKey = ingestSecret();
    const decision = buildClickEvent({ headers: request.headers, sponsorId });
    if (
      !shouldRecordClick({
        decision,
        signingKey,
        host: requestHost(request.headers),
        previewHost: roseCityPreviewHost(),
      })
    ) {
      return;
    }
    if (decision.kind !== "record" || !signingKey) return;
    if (!(await clubHasTelemetry(decision.clubId))) return;
    // Serialise once and sign exactly that text; the database verifies the same bytes.
    const payload = JSON.stringify(decision.event);
    const signature = signPayload(decision.clubId, payload, signingKey);
    await createPublicClient()
      .schema("onzio")
      .rpc("record_page_event", { p_club_id: decision.clubId, p_payload: payload, p_signature: signature });
  } catch {
    // Telemetry never fails a click.
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; sponsor: string }> },
): Promise<Response> {
  const { sponsor } = await params;
  // Set only by middleware after verified tenant resolution; middleware deletes any client copy first.
  const clubId = request.headers.get("x-onzio-club-id") ?? "";
  if (!UUID.test(clubId)) return notFound();
  if (!UUID.test(sponsor)) return notFound();

  const { data, error } = await createPublicClient()
    .schema("onzio")
    .from("site_sponsor_logos")
    .select("website_url")
    .eq("club_id", clubId.toLowerCase())
    .eq("id", sponsor.toLowerCase())
    .maybeSingle();
  if (error) return notFound();
  const destination = httpUrl(data?.website_url);
  if (!destination) return notFound();

  try {
    after(() => recordClick(request, sponsor));
  } catch {
    // Telemetry never delays or breaks the redirect.
  }

  // Not an open redirect: the destination is only ever the website URL this club stored for this
  // sponsor, looked up by the verified club id above, never a value taken from the request.
  return new Response(null, {
    status: 302,
    headers: { Location: destination, "Cache-Control": "no-store" },
  });
}
