import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAdminAccess } from "@/lib/authorization";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Column order matches onzio.registration_responses exactly (see
// supabase/migrations/20260818120100_registration_forms_responses.sql) so the
// export is a faithful, complete copy of the table -- not a hand-picked
// subset that silently drops a column a future migration adds meaning to.
const RESPONSE_COLUMNS = [
  "id",
  "form_id",
  "player_first_name",
  "player_last_name",
  "player_dob",
  "parent_guardian_name",
  "parent_guardian_email",
  "parent_guardian_phone",
  "notes",
  "interest_area",
  "waiver_accepted_at",
  "waiver_version_accepted",
  "payment_status",
  "stripe_checkout_session_id",
  "stripe_payment_intent_id",
  "amount_paid_cents",
  "paid_at",
  "submitted_at",
] as const;

const requestSchema = z.object({
  formId: z.string().uuid(),
});

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: { code, message: code } }, { status });
}

// RFC 4180-ish escaping: wrap in quotes and double any embedded quote
// whenever the field contains a comma, quote, or line break. Every
// registration_responses field can contain arbitrary family-entered text
// (names, notes), so this always runs rather than being applied selectively.
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: readonly unknown[]): string {
  return values.map(csvField).join(",");
}

function safeFileNameSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedQuery = requestSchema.safeParse({
    formId: url.searchParams.get("formId"),
  });
  if (!parsedQuery.success) {
    return errorResponse("INVALID_EXPORT_REQUEST", 400);
  }

  const supabase = await createClient();

  // Never trust a client-supplied club scope: the only club this request can
  // ever act on is the one resolved from the requester's own verified
  // session below, exactly like app/api/admin/data/route.ts and
  // lib/media-route-auth.ts.
  let userId: string;
  try {
    ({ userId } = await requireFreshClubSession(supabase));
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "AUTHENTICATION_REQUIRED";
    return errorResponse(code, code === "AUTHENTICATION_REQUIRED" ? 401 : 403);
  }

  let club;
  try {
    club = await getClubContext({
      hostname: request.headers.get("host") ?? "",
      userId,
    });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "UNKNOWN_TENANT";
    return errorResponse(code, 404);
  }

  const memberships = club.role
    ? [{ userId, clubId: club.id, role: club.role, status: "active" }]
    : [];

  try {
    await authorizeAdminAccess({
      club,
      userId,
      memberships,
      aal: "aal1",
      capability: "content",
    });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "NOT_AUTHORIZED";
    return errorResponse(code, 403);
  }

  const onzio = supabase.schema("onzio");

  // Re-verify the form belongs to this session's own club before touching
  // registration_responses at all. A formId for another club must read as
  // "not found," never leak the other club's title/type, and never fall
  // through to a query that could return that club's family PII.
  const { data: form, error: formError } = await onzio
    .from("registration_forms")
    .select("id, title")
    .eq("club_id", club.id)
    .eq("id", parsedQuery.data.formId)
    .maybeSingle();
  if (formError) {
    return errorResponse("DATABASE_OPERATION_FAILED", 500);
  }
  if (!form) {
    return errorResponse("FORM_NOT_FOUND", 404);
  }

  // select("*") rather than a dynamically-joined column list: PostgREST/
  // supabase-js can only infer a typed row shape from a literal select
  // string, and RESPONSE_COLUMNS is assembled at runtime. The CSV output
  // below still only ever reads the RESPONSE_COLUMNS whitelist off each row,
  // so no column this route doesn't already declare can reach the file.
  const { data: responses, error: responsesError } = await onzio
    .from("registration_responses")
    .select("*")
    .eq("club_id", club.id)
    .eq("form_id", form.id)
    .order("submitted_at", { ascending: true });
  if (responsesError) {
    return errorResponse("DATABASE_OPERATION_FAILED", 500);
  }

  const lines = [
    csvRow(RESPONSE_COLUMNS),
    ...(responses ?? []).map((row) =>
      csvRow(RESPONSE_COLUMNS.map((column) => row[column])),
    ),
  ];
  // CRLF per RFC 4180; UTF-8 BOM so the family names/notes in this file open
  // correctly in Excel, which otherwise mis-decodes non-ASCII UTF-8 CSVs.
  const csv = "﻿" + lines.join("\r\n") + "\r\n";

  const fileName = `registrations-${safeFileNameSegment(form.title) || form.id}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
