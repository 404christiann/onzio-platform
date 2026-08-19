import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ResponsesClient, {
  type ResponsesFormRow,
  type ResponsesResponseRow,
} from "@/components/admin/responses/ResponsesClient";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// CV United C1: the registrations module (packages/presentation/index.ts) is
// declared in supportedModules on crest@1 only, the same way `programs` is
// scoped to academy@1 alone. This page mirrors that at the admin boundary so
// a club running any other template can't reach a Responses screen for a
// module its public site never renders.
const REGISTRATIONS_TEMPLATE = "crest@1";

export default async function ResponsesPage() {
  const supabase = await createClient();

  // The (protected) layout already requires a fresh club session and
  // redirects otherwise; this repeats the check independently at the page
  // boundary, the same defense-in-depth convention app/admin/(protected)/
  // payments/page.tsx uses for its own sensitive (billing) data.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const requestHeaders = await headers();
  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
    userId: user.id,
  }).catch(() => null);

  if (
    !club ||
    club.lifecycle === "archived" ||
    (club.role !== "owner" && club.role !== "admin")
  ) {
    redirect("/admin/login?error=not_authorized");
  }

  if (club.presentationTemplateKey !== REGISTRATIONS_TEMPLATE) {
    redirect("/admin");
  }

  const onzio = supabase.schema("onzio");

  // Explicit club_id scope on every query here, on top of RLS
  // (registration_forms_member_read / registration_responses_member_read),
  // matching this repo's defense-in-depth convention (see
  // app/admin/(protected)/payments/page.tsx and app/api/admin/data/route.ts):
  // RLS is the backstop, not the only check, for a table that holds real
  // families' PII including minors' dates of birth.
  const [{ data: formsData, error: formsError }, { data: responsesData, error: responsesError }] =
    await Promise.all([
      onzio
        .from("registration_forms")
        .select("id, title, form_type, status")
        .eq("club_id", club.id)
        .order("created_at", { ascending: false }),
      onzio
        .from("registration_responses")
        .select(
          "id, form_id, submitted_at, player_first_name, player_last_name, parent_guardian_name, parent_guardian_email, parent_guardian_phone, payment_status",
        )
        .eq("club_id", club.id)
        .order("submitted_at", { ascending: false }),
    ]);

  if (formsError || responsesError) {
    throw new Error(
      formsError?.message ?? responsesError?.message ?? "Failed to load responses",
    );
  }

  const forms = (formsData ?? []) as ResponsesFormRow[];
  const responses = (responsesData ?? []) as ResponsesResponseRow[];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1
          className="font-display font-black uppercase leading-none text-foreground"
          style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
        >
          Responses
        </h1>
        <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
          Registration form submissions for {club.name}. Select a form to see
          its responses, or export them to CSV.
        </p>
      </div>

      <ResponsesClient forms={forms} responses={responses} />
    </div>
  );
}
