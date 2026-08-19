import { notFound } from "next/navigation";
import JoinPage from "@/components/JoinPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

// CV United C1: the tenant-runtime half of the `join` route, mirroring the
// DCFC-304 tryouts/programs/contact dual-file pattern. `join` is registered on
// crest@1 only, so every other template 404s here rather than falling through
// to a page it has no content for -- the same guard the pathway@1 stage pages
// use.
//
// Reads registration_forms through the session-aware anon client (not
// service-role -- see app/api/registrations/interest/route.ts for why that
// boundary is reserved for the privileged write) exactly as
// registration_forms_public_read intends: "a public /join page has to be
// able to read it anonymously" (20260818120100_registration_forms_responses.
// sql). `status = 'live'` is filtered explicitly here too, rather than
// relying solely on RLS, so a signed-in club admin previewing their own
// public site (whom registration_forms_member_read also grants draft
// visibility) never sees a draft form rendered as if it were live.
export default async function TenantJoinPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "crest@1") notFound();

  const onzio = (await createClient()).schema("onzio");
  const { data: liveForms } = await onzio
    .from("registration_forms")
    .select("form_type")
    .eq("club_id", club.id)
    .eq("status", "live")
    .in("form_type", ["general_interest", "academy_registration"]);

  const generalInterestLive = (liveForms ?? []).some(
    (form) => form.form_type === "general_interest",
  );
  const academyLive = (liveForms ?? []).some(
    (form) => form.form_type === "academy_registration",
  );

  return (
    <JoinPage
      generalInterestLive={generalInterestLive}
      academyLive={academyLive}
    />
  );
}
