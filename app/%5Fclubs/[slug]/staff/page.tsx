import { notFound, redirect } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";

// MLA P1 Step 6: pathway@1 is not a sports-CMS site, so this sports-CMS-only
// route 404s for that tenant instead of redirecting into an empty roster.
// app/(public)/staff/page.tsx's default export just calls redirect(), which
// returns void and can't be rendered as JSX, so this mirrors its one line
// directly rather than importing and invoking it as a component.
export default async function TenantStaffPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey === "pathway@1") notFound();
  redirect("/roster#staff");
}
