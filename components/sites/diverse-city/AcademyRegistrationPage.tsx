import RegistrationCtaButton from "@/components/registration/RegistrationCtaButton";
import type { PublicRegistrationForm } from "@/lib/registration-public";

type Props =
  | { state: "closed" }
  | { state: "open"; clubName: string; form: PublicRegistrationForm; checkoutCancelled: boolean };

export default function AcademyRegistrationPage(props: Props) {
  if (props.state === "closed") {
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

  return (
    <section className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-red)]">{props.clubName}</p>
      <h1 className="mt-3 font-display text-5xl font-black uppercase leading-[0.9] text-[var(--color-black)] sm:text-6xl">{props.form.title}</h1>
      {props.form.description && <p className="mt-6 max-w-2xl font-body text-lg leading-relaxed text-black/70">{props.form.description}</p>}
      {props.checkoutCancelled && <p role="status" className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 font-body text-sm text-amber-950">Checkout was cancelled. Your registration was not completed.</p>}
      <div className="mt-8">
        <RegistrationCtaButton form={props.form} />
      </div>
    </section>
  );
}
