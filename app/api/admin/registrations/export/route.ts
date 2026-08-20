import { NextResponse } from "next/server";
import { ContractError } from "@/lib/contract-error";
import { buildRegistrationExportCsv } from "@/lib/registration-export";
import { requireRegistrationRouteAuthorization } from "@/lib/registration-route-auth";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const formId = new URL(request.url).searchParams.get("formId") ?? "";
    if (!UUID.test(formId)) throw new ContractError("INVALID_REGISTRATION_FORM");
    const { supabase, club } = await requireRegistrationRouteAuthorization(request);
    const onzio = supabase.schema("onzio");
    const [fieldsResult, registrationsResult] = await Promise.all([
      onzio.from("registration_form_fields")
        .select("field_key,position")
        .eq("club_id", club.id)
        .eq("form_id", formId)
        .order("position", { ascending: true }),
      onzio.from("registrations")
        .select("answers,price_label,amount_cents,status,submitted_at")
        .eq("club_id", club.id)
        .eq("form_id", formId)
        .in("status", ["paid", "refunded"])
        .order("submitted_at", { ascending: false }),
    ]);
    if (fieldsResult.error || registrationsResult.error) {
      throw new ContractError("REGISTRATION_EXPORT_READ_FAILED");
    }
    const csv = buildRegistrationExportCsv((registrationsResult.data ?? []).map((row) => ({
      answers: row.answers as Record<string, string | number | boolean | null | undefined>,
      priceLabel: row.price_label, amountCents: row.amount_cents,
      status: row.status, submittedAt: row.submitted_at,
    })), (fieldsResult.data ?? []).map((field) => field.field_key));
    return new NextResponse(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-${formId}.csv"`,
      "Cache-Control": "no-store",
    } });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "REGISTRATION_EXPORT_FAILED";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401 : code === "INVALID_REGISTRATION_FORM" ? 400 : error instanceof ContractError ? 403 : 500;
    return NextResponse.json({ error: { code } }, { status });
  }
}
