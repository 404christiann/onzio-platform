import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { buildCoreRegistrationFields } from "@/lib/registration-fields";
import { DIVERSE_CITY_LOCAL_TENANT_ID } from "@/lib/migration/diverse-city-plan";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import {
  SPECIAL_KICKERS_CORE_FIELD_LABELS,
  SPECIAL_KICKERS_REGISTRATION_DRAFT,
} from "@/scripts/fixtures/special-kickers-registration";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const CLUB_SLUG = "diverse-city";
const FORM_ID = deterministicUuid(
  "onzio:diverse-city:registration:special-kickers-fall-2026",
);
const PRICE_ID = deterministicUuid(
  "onzio:diverse-city:registration-price:special-kickers-fall-2026",
);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseArgs(): { execute: boolean } {
  const args = process.argv.slice(2);
  const unexpected = args.filter(
    (argument) =>
      argument !== "--execute-local" && argument !== "--confirm-local",
  );
  if (unexpected.length > 0) {
    throw new Error(`Unexpected argument(s): ${unexpected.join(", ")}`);
  }
  const execute = args.includes("--execute-local");
  const confirmed = args.includes("--confirm-local");
  if (execute !== confirmed) {
    throw new Error(
      "Writing requires both --execute-local and --confirm-local.",
    );
  }
  return { execute };
}

async function main() {
  loadEnvConfig(process.cwd());
  const { execute } = parseArgs();
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const hostname = new URL(supabaseUrl).hostname;
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing non-loopback Supabase host "${hostname}". This seed is local-only.`,
    );
  }

  const definition = {
    id: FORM_ID,
    clubId: DIVERSE_CITY_LOCAL_TENANT_ID,
    ...SPECIAL_KICKERS_REGISTRATION_DRAFT,
    fieldCount:
      buildCoreRegistrationFields(
        SPECIAL_KICKERS_REGISTRATION_DRAFT.participant_mode,
      ).length + SPECIAL_KICKERS_REGISTRATION_DRAFT.customFields.length,
    priceId: PRICE_ID,
  };
  if (!execute) {
    console.log(
      JSON.stringify(
        { mode: "dry-run", definition, hostedMutations: 0 },
        null,
        2,
      ),
    );
    return;
  }

  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const onzio = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Supabase documents this transport override for Node runtimes that do not
    // expose a compatible global WebSocket implementation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: ws as any },
  }).schema("onzio");

  const { data: club, error: clubError } = await onzio
    .from("clubs")
    .select("id,slug,name")
    .eq("slug", CLUB_SLUG)
    .maybeSingle();
  if (clubError) throw clubError;
  if (!club) {
    throw new Error(
      "The local Diverse City tenant is missing. Run the approved local Diverse City import first.",
    );
  }
  if (club.id !== DIVERSE_CITY_LOCAL_TENANT_ID) {
    throw new Error(
      `Diverse City resolved to ${club.id}; expected local tenant ${DIVERSE_CITY_LOCAL_TENANT_ID}.`,
    );
  }

  const { data: existingForm, error: existingFormError } = await onzio
    .from("registration_forms")
    .select("id,status")
    .eq("club_id", club.id)
    .eq("id", FORM_ID)
    .maybeSingle();
  if (existingFormError) throw existingFormError;
  if (existingForm && existingForm.status !== "draft") {
    throw new Error(
      "Refusing to replace a Special Kickers form that is no longer a draft.",
    );
  }

  const { count: registrationCount, error: registrationCountError } =
    await onzio
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("club_id", club.id)
      .eq("form_id", FORM_ID);
  if (registrationCountError) throw registrationCountError;
  if ((registrationCount ?? 0) > 0) {
    throw new Error(
      "Refusing to replace a draft that already has registration rows.",
    );
  }

  const formResult = await onzio.from("registration_forms").upsert(
    {
      id: FORM_ID,
      club_id: club.id,
      slug: SPECIAL_KICKERS_REGISTRATION_DRAFT.slug,
      title: SPECIAL_KICKERS_REGISTRATION_DRAFT.title,
      description: SPECIAL_KICKERS_REGISTRATION_DRAFT.description,
      participant_mode: SPECIAL_KICKERS_REGISTRATION_DRAFT.participant_mode,
      waiver_text: SPECIAL_KICKERS_REGISTRATION_DRAFT.waiver_text,
      status: "draft",
      closed_at: null,
    },
    { onConflict: "club_id,id" },
  );
  if (formResult.error) throw formResult.error;

  const clearFields = await onzio
    .from("registration_form_fields")
    .delete()
    .eq("club_id", club.id)
    .eq("form_id", FORM_ID);
  if (clearFields.error) throw clearFields.error;

  const coreFields = buildCoreRegistrationFields("both").map(
    (fieldDefinition) => ({
      field_key: fieldDefinition.key,
      label:
        SPECIAL_KICKERS_CORE_FIELD_LABELS[fieldDefinition.key] ??
        fieldDefinition.label,
      field_type: fieldDefinition.type,
      options: fieldDefinition.options ?? [],
      required: true,
      is_core: true,
      participant_scope: fieldDefinition.participantScope ?? "all",
    }),
  );
  const allFields = [
    ...coreFields,
    ...SPECIAL_KICKERS_REGISTRATION_DRAFT.customFields,
  ].map((fieldDefinition, position) => ({
    id: deterministicUuid(
      `onzio:diverse-city:registration-field:special-kickers:${fieldDefinition.field_key}`,
    ),
    club_id: club.id,
    form_id: FORM_ID,
    ...fieldDefinition,
    position,
  }));
  const fieldsResult = await onzio
    .from("registration_form_fields")
    .insert(allFields);
  if (fieldsResult.error) throw fieldsResult.error;

  const clearPrices = await onzio
    .from("registration_price_options")
    .delete()
    .eq("club_id", club.id)
    .eq("form_id", FORM_ID);
  if (clearPrices.error) throw clearPrices.error;
  const priceResult = await onzio.from("registration_price_options").insert({
    id: PRICE_ID,
    club_id: club.id,
    form_id: FORM_ID,
    label: SPECIAL_KICKERS_REGISTRATION_DRAFT.price.label,
    amount_cents: SPECIAL_KICKERS_REGISTRATION_DRAFT.price.amount_cents,
    active: true,
    position: 0,
  });
  if (priceResult.error) throw priceResult.error;

  const { data: savedForm, error: savedFormError } = await onzio
    .from("registration_forms")
    .select("id,slug,title,participant_mode,status")
    .eq("club_id", club.id)
    .eq("id", FORM_ID)
    .single();
  if (savedFormError) throw savedFormError;

  console.log(
    JSON.stringify(
      {
        mode: "local-write",
        club: { id: club.id, slug: club.slug, name: club.name },
        form: savedForm,
        fieldCount: allFields.length,
        price: SPECIAL_KICKERS_REGISTRATION_DRAFT.price,
        stripeConnectMutations: 0,
        published: false,
        hostedMutations: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
