import { notFound } from "next/navigation";
import JoinInterestForm from "@/components/JoinInterestForm";
import JoinInterestOpeningSoon from "@/components/JoinInterestOpeningSoon";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// CV United C1: the tenant-runtime half of `/join/interest`, mirroring
// app/%5Fclubs/[slug]/join/academy/page.tsx's dual-file + template-guard +
// RLS-decides pattern exactly (see that file's header comment for the full
// rationale). crest@1 only, same as /join and /join/academy.
//
// This page does NOT filter `.eq("status", "live")` itself and does NOT
// decide for itself whether the real form or the opening-soon placeholder
// renders -- it queries onzio.registration_forms through the request-scoped,
// cookie-bound Supabase client and lets Postgres RLS decide what comes back:
//
//   * registration_forms_public_read (anon + authenticated, no fresh club
//     session) returns a row only when status = 'live' and the club is
//     publicly accessible.
//   * registration_forms_member_read additionally returns this club's own
//     draft/closed row to a signed-in, session-fresh owner/admin of that
//     club, so an operator can preview the interest form before publishing
//     it -- JoinInterestForm renders that case with a disabled-submit
//     preview banner via its `formStatus` prop, exactly like
//     AcademyRegistrationForm does for /join/academy.
//
// A public visitor querying a draft/closed/nonexistent form gets `null`
// back and sees JoinInterestOpeningSoon, with no way to distinguish which
// case it was -- the same non-discoverability the migration's public read
// policy documents.
export default async function TenantJoinInterestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "crest@1") notFound();

  const onzio = (await createClient()).schema("onzio");
  const { data: form } = await onzio
    .from("registration_forms")
    .select("id, title, description, status")
    .eq("club_id", club.id)
    .eq("form_type", "general_interest")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!form) {
    return <JoinInterestOpeningSoon clubName={club.name} />;
  }

  return (
    <JoinInterestForm
      clubName={club.name}
      title={form.title}
      description={form.description}
      formStatus={form.status as "draft" | "live" | "closed"}
    />
  );
}
