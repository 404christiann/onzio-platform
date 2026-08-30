import { NextResponse } from "next/server";
import {
  ADMIN_SELECT_MEDIA_REFERENCES,
  ADMIN_TABLE_FEATURES,
  adminDataRequestSchema,
  SINGLETON_TABLES,
  type AdminDataRequest,
} from "@/lib/admin-data-contract";
import { resolveMediaReferences } from "@/lib/media-assets";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { ContractError } from "@/lib/contract-error";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function errorResponse(code: string, status: number, message = code) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function addTenantToPayload(
  request: AdminDataRequest,
  clubId: string,
): Record<string, unknown> | Record<string, unknown>[] | undefined {
  if (!request.payload) return undefined;
  const addTenant = (row: Record<string, unknown>) => {
    const next = { ...row };
    if (SINGLETON_TABLES.has(request.table)) delete next.id;
    if (
      next.id === null ||
      (typeof next.id === "string" &&
        next.id !== "" &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          next.id,
        ) &&
        request.table !== "site_social_links")
    ) {
      delete next.id;
    }
    return { ...next, club_id: clubId };
  };
  return Array.isArray(request.payload)
    ? request.payload.map(addTenant)
    : addTenant(request.payload);
}

export async function POST(request: Request) {
  const parsed = adminDataRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return errorResponse("INVALID_ADMIN_PAYLOAD", 400, parsed.error.message);
  }

  const supabase = await createClient();
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
    ? [
        {
          userId,
          clubId: club.id,
          role: club.role,
          status: "active",
        },
      ]
    : [];

  try {
    if (parsed.data.operation === "select") {
      await authorizeAdminAccess({
        club,
        userId,
        memberships,
        aal: "aal1",
        capability: "content",
      });
    } else {
      await authorizeMutation({
        club,
        userId,
        memberships,
        aal: "aal1",
        feature: ADMIN_TABLE_FEATURES[parsed.data.table],
        payload: (parsed.data.payload ?? {}) as Record<string, unknown>,
      });
    }
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "NOT_AUTHORIZED";
    return errorResponse(code, 403);
  }

  const input = parsed.data;
  const onzio = supabase.schema("onzio");
  const table = onzio.from(input.table) as any;
  let query: any;
  const payload = addTenantToPayload(input, club.id);

  switch (input.operation) {
    case "select":
      query = table
        .select(input.columns, { count: input.count, head: input.head })
        .eq("club_id", club.id);
      break;
    case "insert":
      query = table.insert(payload!).select(input.columns);
      break;
    case "update":
      query = table
        .update(payload!)
        .eq("club_id", club.id)
        .select(input.columns);
      break;
    case "upsert": {
      const requestedConflict =
        input.onConflict ??
        (input.table === "shop_kit_section"
          ? "surface,kit_variant"
          : undefined);
      const onConflict = requestedConflict
        ? requestedConflict
            .split(",")
            .includes("club_id")
          ? requestedConflict
          : `club_id,${requestedConflict}`
        : undefined;
      query = table
        .upsert(payload!, { onConflict })
        .select(input.columns);
      break;
    }
    case "delete":
      query = table
        .delete()
        .eq("club_id", club.id)
        .select(input.columns);
      break;
  }

  for (const filter of input.filters) {
    if (filter.column === "club_id") {
      return errorResponse("UNTRUSTED_TENANT_INPUT", 400);
    }
    if (filter.kind === "in") {
      if (!Array.isArray(filter.value)) {
        return errorResponse("INVALID_ADMIN_FILTER", 400);
      }
      query = query.in(filter.column, filter.value);
    } else {
      query = query[filter.kind](filter.column, filter.value);
    }
  }
  if (input.order) {
    query = query.order(input.order.column, {
      ascending: input.order.ascending,
    });
  }
  if (input.limit) query = query.limit(input.limit);
  if (input.single) query = query[input.single]();

  const result = await query;
  if (result.error) {
    return errorResponse("DATABASE_OPERATION_FAILED", 400, result.error.message);
  }

  let data = result.data ?? null;
  const mediaReferences = ADMIN_SELECT_MEDIA_REFERENCES[input.table];
  if (input.operation === "select" && mediaReferences && data) {
    // Admin editors need the same delivery URL the public site resolves, or a
    // club's already-published hero and detail images have nothing to render.
    const rows = Array.isArray(data) ? data : [data];
    try {
      const resolved = await resolveMediaReferences(
        rows as Record<string, unknown>[],
        club.id,
        mediaReferences,
        onzio as unknown as Parameters<typeof resolveMediaReferences>[3],
      );
      data = Array.isArray(data) ? resolved : (resolved[0] ?? null);
    } catch {
      // Media hydration is presentational. A club that can read its own rows
      // should still get them if the asset lookup fails; the editor falls back
      // to its "media attached" state rather than failing the whole page load.
    }
  }

  return NextResponse.json({
    data,
    count: result.count ?? null,
    error: null,
  });
}
