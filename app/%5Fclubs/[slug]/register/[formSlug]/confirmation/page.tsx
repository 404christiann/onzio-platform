import { notFound } from "next/navigation";
import { codeSiteFor } from "@/lib/code-site";
import AcademyRegistrationConfirmationPage from "@/components/sites/diverse-city/AcademyRegistrationConfirmationPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import RegistrationConfirmation from "@/components/registration/RegistrationConfirmation";

export const dynamic = "force-dynamic";

export default async function RegistrationConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; formSlug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  try {
    const club = await getClubContextBySlug((await params).slug);
    if (codeSiteFor(club) === "diverse-city") {
      return <AcademyRegistrationConfirmationPage token={typeof token === "string" ? token : null} />;
    }
    return <RegistrationConfirmation token={typeof token === "string" ? token : null} />;
  } catch (error) {
    if (error instanceof ContractError) notFound();
    throw error;
  }
}
