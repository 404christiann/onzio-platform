import { NextResponse } from "next/server";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { loadLinkedOpenRegistrationForms } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Public form payloads for the actual program CTA preview, tenant scoped. */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { userId } = await requireFreshClubSession(supabase);
    const club = await getClubContext({ hostname: request.headers.get("host") ?? "", userId });
    if (!club || club.presentationTemplateKey !== "academy@1") return NextResponse.json({ error: { code: "PAGE_UNAVAILABLE" } }, { status: 404 });
    const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
    await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
    const onzio = supabase.schema("onzio");
    const { data, error } = await onzio.from("registration_forms").select("id").eq("club_id", club.id).eq("status", "open");
    if (error) throw new Error("Unable to load open registration forms");
    const forms = await loadLinkedOpenRegistrationForms(
      (data ?? []).map((form) => ({ registration_form_id: form.id })),
      club.id,
      onzio,
    );
    return NextResponse.json({ forms: Object.fromEntries(forms) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "DATABASE_OPERATION_FAILED";
    return NextResponse.json({ error: { code } }, { status: code === "AUTHENTICATION_REQUIRED" ? 401 : code === "DATABASE_OPERATION_FAILED" ? 500 : 403 });
  }
}
