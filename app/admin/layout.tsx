import { headers } from "next/headers";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { PublicPageVisibilityProvider } from "@/components/PublicPageVisibilityProvider";
import { getClubContext } from "@/lib/club-context";
import { fetchPublicPageVisibility } from "@/lib/public-page-visibility-query";
import { createClient } from "@/lib/supabase-server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
    userId: user?.id,
  }).catch(() => null);

  if (!club) return <>{children}</>;

  // Fail-open read of the "Visible to visitors" switches; PageVisibilityControl shows it.
  const pageVisibility = await fetchPublicPageVisibility(club.id);

  return (
    <ClubContextProvider club={club}>
      <PublicPageVisibilityProvider visibility={pageVisibility}>
        <ClubBrandingProvider>{children}</ClubBrandingProvider>
      </PublicPageVisibilityProvider>
    </ClubContextProvider>
  );
}
