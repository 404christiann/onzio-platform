import { notFound } from "next/navigation";
import RegistrationCtaButton from "@/components/registration/RegistrationCtaButton";
import { ContractError } from "@/lib/contract-error";
import { toPublicRegistrationForm } from "@/lib/registration-public";
import { getClubContextBySlug } from "@/lib/club-context";
import { loadOpenRegistrationForm } from "@/lib/registration-service";

export const dynamic = "force-dynamic";

export default async function RegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; formSlug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { slug, formSlug } = await params;
  const query = await searchParams;
  try {
    const club = await getClubContextBySlug(slug);
    if (club.lifecycle !== "active" || (club.publicAccess !== "live" && club.publicAccess !== "grace")) notFound();
    const form = toPublicRegistrationForm(await loadOpenRegistrationForm(club.id, formSlug));
    return (
      <section className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-red)]">{club.name}</p>
        <h1 className="mt-3 font-display text-5xl font-black uppercase leading-[0.9] text-[var(--color-black)] sm:text-6xl">{form.title}</h1>
        {form.description && <p className="mt-6 max-w-2xl font-body text-lg leading-relaxed text-black/70">{form.description}</p>}
        {query.checkout === "cancelled" && <p role="status" className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 font-body text-sm text-amber-950">Checkout was cancelled. Your registration was not completed.</p>}
        <div className="mt-8">
          <RegistrationCtaButton form={form} />
        </div>
      </section>
    );
  } catch (error) {
    if (
      error instanceof ContractError &&
      error.code === "REGISTRATION_FORM_CLOSED"
    ) {
      return (
        <section className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-red)]">
            Registration update
          </p>
          <h1 className="mt-3 font-display text-5xl font-black uppercase leading-[0.9] text-[var(--color-black)] sm:text-6xl">
            Registration closed
          </h1>
          <p className="mt-6 max-w-2xl font-body text-lg leading-relaxed text-black/70">
            This registration is no longer accepting new submissions. Contact
            the club if you need help.
          </p>
        </section>
      );
    }
    if (error instanceof ContractError) notFound();
    throw error;
  }
}
