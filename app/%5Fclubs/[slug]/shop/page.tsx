import { notFound } from "next/navigation";
import ShopPage from "@/app/(public)/shop/page";
import { getClubContextBySlug } from "@/lib/club-context";

// MLA P1 Step 6: pathway@1 is not a sports-CMS site, so this sports-CMS-only
// route 404s for that tenant instead of rendering an empty shop shell.
export default async function TenantShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey === "pathway@1") notFound();
  return <ShopPage />;
}
