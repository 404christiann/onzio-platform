import { headers } from "next/headers";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { getClubContext } from "@/lib/club-context";
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

  return (
    <ClubContextProvider club={club}>
      <ClubBrandingProvider>{children}</ClubBrandingProvider>
    </ClubContextProvider>
  );
}
