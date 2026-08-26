import { NextResponse } from "next/server";
import { z } from "zod";
import { registrationParticipantModeSchema } from "@/lib/registration-fields";
import { requireRegistrationRouteAuthorization } from "@/lib/registration-route-auth";
import { slugify, uniqueSlug } from "@/lib/slugify";

export const dynamic = "force-dynamic";

const formIdSchema = z.string().uuid();
const requestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(5_000),
      participantMode: registrationParticipantModeSchema,
      waiverText: z.string().trim().min(1).max(50_000),
    })
    .strict(),
  z
    .object({
      action: z.enum(["publish", "stop", "archive", "delete"]),
      formId: formIdSchema,
    })
    .strict(),
]);

type RegistrationAction = z.infer<typeof requestSchema>;
type DatabaseError = { code?: string; message?: string } | null;
type FormState = {
  id: string;
  status: "draft" | "open" | "closed";
  archived_at: string | null;
};

class RegistrationAdminError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message = code,
  ) {
    super(message);
  }
}

function errorResponse(code: string, status: number, message = code) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function databaseError(error: DatabaseError): never {
  const message = error?.message ?? "";
  for (const code of [
    "REGISTRATION_FORM_ARCHIVED",
    "REGISTRATION_PRICE_OPTION_REQUIRED",
    "REGISTRATION_CORE_FIELDS_REQUIRED",
    "STRIPE_CONNECT_REQUIRED",
  ]) {
    if (message.includes(code)) {
      throw new RegistrationAdminError(code, 409);
    }
  }
  if (error?.code === "23503") {
    throw new RegistrationAdminError("REGISTRATION_FORM_IN_USE", 409);
  }
  throw new RegistrationAdminError("REGISTRATION_FORM_MUTATION_FAILED", 500);
}

async function loadFormState(
  onzio: any,
  clubId: string,
  formId: string,
): Promise<FormState> {
  const result = await onzio
    .from("registration_forms")
    .select("id,status,archived_at")
    .eq("club_id", clubId)
    .eq("id", formId)
    .maybeSingle();
  if (result.error) databaseError(result.error);
  if (!result.data) {
    throw new RegistrationAdminError("REGISTRATION_FORM_NOT_FOUND", 404);
  }
  return result.data as FormState;
}

async function createForm(
  onzio: any,
  clubId: string,
  input: Extract<RegistrationAction, { action: "create" }>,
) {
  const baseSlug = slugify(input.title, 80);
  const collided = new Set<string>();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slugs = await onzio
      .from("registration_forms")
      .select("slug")
      .eq("club_id", clubId);
    if (slugs.error) databaseError(slugs.error);
    const slug = uniqueSlug(
      baseSlug,
      [
        ...(slugs.data ?? []).map((row: { slug: string }) => row.slug),
        ...collided,
      ],
      80,
    );
    const result = await onzio
      .from("registration_forms")
      .insert({
        club_id: clubId,
        slug,
        title: input.title,
        description: input.description,
        participant_mode: input.participantMode,
        waiver_text: input.waiverText,
        status: "draft",
      })
      .select("*")
      .single();
    if (!result.error && result.data) return result.data;
    if (result.error?.code !== "23505") databaseError(result.error);
    collided.add(slug);
  }

  throw new RegistrationAdminError("REGISTRATION_SLUG_CONFLICT", 409);
}

async function hasRows(query: PromiseLike<{ data: unknown[] | null; error: DatabaseError }>) {
  const result = await query;
  if (result.error) databaseError(result.error);
  return (result.data ?? []).length > 0;
}

async function deleteForm(onzio: any, clubId: string, form: FormState) {
  const [hasRegistrations, hasPrograms, hasTryouts] = await Promise.all([
    hasRows(
      onzio
        .from("registrations")
        .select("id")
        .eq("club_id", clubId)
        .eq("form_id", form.id)
        .limit(1),
    ),
    hasRows(
      onzio
        .from("programs")
        .select("id")
        .eq("club_id", clubId)
        .eq("registration_form_id", form.id)
        .limit(1),
    ),
    hasRows(
      onzio
        .from("tryouts")
        .select("id")
        .eq("club_id", clubId)
        .eq("registration_form_id", form.id)
        .limit(1),
    ),
  ]);

  if (hasRegistrations) {
    throw new RegistrationAdminError(
      "REGISTRATION_FORM_HAS_REGISTRATIONS",
      409,
    );
  }
  if (hasPrograms || hasTryouts) {
    throw new RegistrationAdminError("REGISTRATION_FORM_LINKED", 409);
  }

  const result = await onzio
    .from("registration_forms")
    .delete()
    .eq("club_id", clubId)
    .eq("id", form.id)
    .select("id")
    .maybeSingle();
  if (result.error) databaseError(result.error);
  if (!result.data) {
    throw new RegistrationAdminError("REGISTRATION_FORM_IN_USE", 409);
  }
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("INVALID_REGISTRATION_ADMIN_REQUEST", 400);
  }

  try {
    const { supabase, club } =
      await requireRegistrationRouteAuthorization(request);
    const onzio = supabase.schema("onzio");

    if (parsed.data.action === "create") {
      const form = await createForm(onzio, club.id, parsed.data);
      return NextResponse.json({ form }, { status: 201 });
    }

    const form = await loadFormState(onzio, club.id, parsed.data.formId);
    if (parsed.data.action === "delete") {
      if (form.archived_at) {
        throw new RegistrationAdminError("REGISTRATION_FORM_ARCHIVED", 409);
      }
      await deleteForm(onzio, club.id, form);
      return NextResponse.json({ success: true });
    }

    if (form.archived_at) {
      throw new RegistrationAdminError("REGISTRATION_FORM_ARCHIVED", 409);
    }

    const values = parsed.data.action === "publish"
      ? { status: "open" }
      : parsed.data.action === "stop"
        ? { status: "closed" }
        : {
            status: form.status === "open" ? "closed" : form.status,
            archived_at: new Date().toISOString(),
          };
    const result = await onzio
      .from("registration_forms")
      .update(values)
      .eq("club_id", club.id)
      .eq("id", form.id)
      .select("id,status,archived_at")
      .single();
    if (result.error) databaseError(result.error);

    return NextResponse.json({ form: result.data });
  } catch (error) {
    if (error instanceof RegistrationAdminError) {
      return errorResponse(error.code, error.status, error.message);
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "REGISTRATION_ADMIN_FAILED";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401 : 403;
    return errorResponse(code, status);
  }
}
