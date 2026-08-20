import RegistrationConfirmation from "@/components/registration/RegistrationConfirmation";

export const dynamic = "force-dynamic";

export default async function RegistrationConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <RegistrationConfirmation token={typeof token === "string" ? token : null} />;
}
