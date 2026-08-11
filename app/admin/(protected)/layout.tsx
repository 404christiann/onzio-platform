import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import RouteTransition from "@/components/RouteTransition";
import AdminLoading from "@/components/admin/AdminLoading";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { createClient } from "@/lib/supabase-server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  let userId: string;
  try {
    ({ userId } = await requireFreshClubSession(supabase));
  } catch (error) {
    if (error instanceof ContractError && error.code === "SESSION_EXPIRED") {
      await supabase.auth.signOut();
      redirect("/admin/login?error=session_expired");
    }
    redirect("/admin/login");
  }

  const requestHeaders = await headers();
  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
    userId,
  }).catch(() => null);
  if (
    !club ||
    club.lifecycle === "archived" ||
    (club.role !== "owner" && club.role !== "admin")
  ) {
    redirect("/admin/login?error=not_authorized");
  }

  // Route-level fade+rise page transition, wrapping only the page content.
  // AdminShell renders `children` inside its own `<main>`, so the sidebar,
  // mobile top bar and billing banner all stay put across navigations and
  // AdminShell.tsx itself is untouched (contract tests assert its nav markup
  // as literal source strings). The delayed indicator reuses the existing
  // AdminLoading in its `brand` tone (the shared `--brand` green, #0eb547).
  return (
    <AdminShell>
      <RouteTransition
        indicator={
          <div className="rounded-full border border-border bg-background px-5 py-3 shadow-lg">
            <AdminLoading tone="brand" />
          </div>
        }
      >
        {children}
      </RouteTransition>
    </AdminShell>
  );
}
