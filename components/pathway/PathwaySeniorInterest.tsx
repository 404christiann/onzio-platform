import PathwayContactForm from "@/components/pathway/PathwayContactForm";
import { PathwaySection } from "@/components/pathway/PathwaySection";

/**
 * Neutral Senior Club interest composition. The route supplies its own
 * supporting copy while the existing contact component remains the single
 * secure form implementation and sends no client-provided tenant identity.
 */
export type PathwaySeniorInterestProps = {
  heading: string;
  intro: string;
  formEyebrow: string;
  formHeading: string;
  formIntro: string;
  submitLabel: string;
  successMessage: string;
  fallbackEmail?: string | null;
};

export default function PathwaySeniorInterest({
  heading,
  intro,
  formEyebrow,
  formHeading,
  formIntro,
  submitLabel,
  successMessage,
  fallbackEmail = null,
}: PathwaySeniorInterestProps) {
  return (
    <div className="pathway-senior-interest">
      <PathwaySection className="pathway-senior-interest-intro">
        <header className="pathway-section-head" data-align="center">
          <h1 className="pathway-section-heading">{heading}</h1>
          <p className="pathway-section-intro">{intro}</p>
        </header>
      </PathwaySection>

      <PathwayContactForm
        eyebrow={formEyebrow}
        heading={formHeading}
        intro={formIntro}
        submitLabel={submitLabel}
        successMessage={successMessage}
        fallbackEmail={fallbackEmail}
      />
    </div>
  );
}
