import { notFound } from "next/navigation";
import AcademyRegistrationForm from "@/components/AcademyRegistrationForm";
import RegistrationOpeningSoon from "@/components/RegistrationOpeningSoon";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// CV United C1: the tenant-runtime half of `/join/academy`, mirroring the
// existing join/page.tsx and tryouts/page.tsx dual-file + template-guard
// pattern. `join`/`join/academy` are registered on crest@1 only.
//
// Draft-gating (the critical safety requirement for this route): this page
// does NOT decide for itself whether the real form or the "opening soon"
// placeholder renders. It queries onzio.registration_forms through the
// request-scoped, cookie-bound Supabase client (same one lib/queries.ts's
// other public-content fetchers use) and lets Postgres RLS decide what comes
// back:
//
//   * registration_forms_public_read (anon + authenticated, no fresh club
//     session) returns a row only when status = 'live' and the club is
//     publicly accessible.
//   * registration_forms_member_read additionally returns a club's own
//     draft/closed rows to a *signed-in, session-fresh owner/admin of that
//     club* -- the platform's existing authenticated-preview mechanism
//     (lib/club-context.ts's `role`, is_club_session_fresh(), used the same
//     way registration_forms_responses.sql's migration header describes,
//     and the same pattern app/admin/(protected)/layout.tsx uses to gate the
//     admin panel).
//
// So: a public visitor querying a draft form gets `null` back and sees
// RegistrationOpeningSoon, with no way to distinguish "draft", "closed", or
// "does not exist" -- exactly the non-discoverability the migration's public
// read policy documents. An authenticated club owner/admin gets the row
// back regardless of status and sees the real form, with a preview banner
// AcademyRegistrationForm renders whenever `status !== 'live'`. No
// client-supplied flag or env var decides this; only what RLS actually
// returned for this request's session does.
//
// This is a real reuse of an existing mechanism, not a new one invented for
// this route -- see HANDOFF.md / this task's report for the alternative
// mechanisms considered and why this one was chosen.
export default async function TenantJoinAcademyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "crest@1") notFound();

  const onzio = (await createClient()).schema("onzio");
  const { data: form } = await onzio
    .from("registration_forms")
    .select(
      "id, title, description, status, requires_payment, price_cents, currency, waiver_text, waiver_version",
    )
    .eq("club_id", club.id)
    .eq("form_type", "academy_registration")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!form) {
    return <RegistrationOpeningSoon clubName={club.name} />;
  }

  return (
    <AcademyRegistrationForm
      clubName={club.name}
      form={{
        id: form.id,
        title: form.title,
        description: form.description,
        status: form.status as "draft" | "live" | "closed",
        requiresPayment: form.requires_payment,
        priceCents: form.price_cents,
        currency: form.currency,
        waiverText: form.waiver_text,
        waiverVersion: form.waiver_version,
      }}
    />
  );
}
