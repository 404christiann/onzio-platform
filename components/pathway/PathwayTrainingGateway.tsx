"use client";

import Link from "next/link";
import { useId, useState, type RefObject } from "react";
import {
  PATHWAY_TRAINING_GATEWAY_CONFIG,
  type PathwayTrainingAgeGroup,
} from "@/components/pathway/training-gateway-config";

type PathwayTrainingGatewayProps = {
  mode: "dialog" | "page";
  headingId?: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onClose?: () => void;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const moneyWithCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function DestinationAction({ href, children }: { href: string; children: string }) {
  return (
    <a className="pathway-training-action" href={href}>
      <span>{children}</span>
      <small>Continues to Acuity</small>
    </a>
  );
}

function AgeSelector({
  selectedAgeId,
  onChange,
  sticky,
}: {
  selectedAgeId: PathwayTrainingAgeGroup["id"] | null;
  onChange: (ageId: PathwayTrainingAgeGroup["id"]) => void;
  sticky: boolean;
}) {
  const descriptionId = useId();
  const radioName = useId();
  const config = PATHWAY_TRAINING_GATEWAY_CONFIG;

  return (
    <div className="pathway-training-age-panel" data-sticky={sticky || undefined}>
      <fieldset className="pathway-training-age-fieldset">
        <legend>{config.prompt}</legend>
        {!sticky && <p id={descriptionId}>{config.promptDescription}</p>}
        <div className="pathway-training-age-options">
          {config.ageGroups.map((ageGroup) => (
            <label key={ageGroup.id}>
              <input
                type="radio"
                name={radioName}
                value={ageGroup.id}
                checked={selectedAgeId === ageGroup.id}
                aria-describedby={!sticky ? descriptionId : undefined}
                onChange={() => onChange(ageGroup.id)}
              />
              <span>{ageGroup.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function TrainingOffers({ ageGroup }: { ageGroup: PathwayTrainingAgeGroup }) {
  const config = PATHWAY_TRAINING_GATEWAY_CONFIG;
  const passesHeadingId = useId();

  return (
    <div className="pathway-training-offers">
      <article className="pathway-training-session-card">
        <div className="pathway-training-card-anchor">
          <strong>{ageGroup.session.durationMinutes}</strong>
          <span>minutes</span>
        </div>
        <div className="pathway-training-card-copy">
          <span className="pathway-training-kicker">One hour session</span>
          <h3>{money.format(ageGroup.session.price)}</h3>
          <p>{config.sessionDescription}</p>
        </div>
        <DestinationAction href={ageGroup.session.href}>
          Book one session
        </DestinationAction>
      </article>

      <section className="pathway-training-passes" aria-labelledby={passesHeadingId}>
        <div className="pathway-training-passes-head">
          <div>
            <span className="pathway-training-kicker">Flexible options</span>
            <h3 id={passesHeadingId}>Training passes</h3>
            <p>{config.passDescription}</p>
          </div>
          <ul aria-label="Class pass restrictions">
            {config.visiblePolicy.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="pathway-training-pass-grid">
          {ageGroup.passes.map((pass) => {
            const isBestValue = pass.classes === 8;
            return (
              <article
                className="pathway-training-pass-card"
                data-best-value={isBestValue || undefined}
                key={pass.classes}
              >
                {isBestValue && (
                  <span className="pathway-training-best-value">
                    Best per class value
                  </span>
                )}
                <div className="pathway-training-card-anchor">
                  <strong>{pass.classes}</strong>
                  <span>classes</span>
                </div>
                <div className="pathway-training-card-copy">
                  <h4>{money.format(pass.price)}</h4>
                  <p>{moneyWithCents.format(pass.price / pass.classes)} per class</p>
                </div>
                <DestinationAction href={pass.href}>
                  {`Buy ${pass.classes} class pass`}
                </DestinationAction>
              </article>
            );
          })}
        </div>

        <article className="pathway-training-unlimited-card">
          <div className="pathway-training-card-anchor">
            <strong>{ageGroup.unlimitedPass.durationDays}</strong>
            <span>days</span>
          </div>
          <div className="pathway-training-card-copy">
            <span className="pathway-training-kicker">Unlimited pass</span>
            <h4>{money.format(ageGroup.unlimitedPass.price)}</h4>
            <p>Unlimited classes for {ageGroup.unlimitedPass.durationDays} days</p>
          </div>
          <DestinationAction href={ageGroup.unlimitedPass.href}>
            Buy unlimited pass
          </DestinationAction>
        </article>
      </section>

      <details className="pathway-training-details">
        <summary>How class passes work</summary>
        <ul>
          {config.policyDetails.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      </details>

      <p className="pathway-training-pricing-note">{config.pricingNote}</p>
    </div>
  );
}

export default function PathwayTrainingGateway({
  mode,
  headingId = "pathway-training-page-title",
  headingRef,
  onClose,
}: PathwayTrainingGatewayProps) {
  const config = PATHWAY_TRAINING_GATEWAY_CONFIG;
  const [selectedAgeId, setSelectedAgeId] = useState<
    PathwayTrainingAgeGroup["id"] | null
  >(null);
  const selectedAge =
    config.ageGroups.find((ageGroup) => ageGroup.id === selectedAgeId) ?? null;
  const Heading = mode === "page" ? "h1" : "h2";

  return (
    <section className="pathway-training-gateway" data-mode={mode}>
      <header className="pathway-training-header">
        <div>
          <span className="pathway-training-kicker">{config.eyebrow}</span>
          <Heading id={headingId} ref={headingRef} tabIndex={mode === "dialog" ? -1 : undefined}>
            {config.title}
          </Heading>
        </div>
        {mode === "dialog" && (
          <button
            type="button"
            className="pathway-training-close"
            aria-label="Close training reservations"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </header>

      <div className="pathway-training-scroll">
        <div className="pathway-training-content" data-has-selection={Boolean(selectedAge)}>
          <AgeSelector
            selectedAgeId={selectedAgeId}
            onChange={setSelectedAgeId}
            sticky={Boolean(selectedAge)}
          />

          {!selectedAge && (
            <p className="pathway-training-contact-fallback">
              Player outside these age groups?{" "}
              <Link href={config.contactHref}>Contact the academy.</Link>
            </p>
          )}

          {selectedAge && <TrainingOffers ageGroup={selectedAge} />}
        </div>
      </div>
    </section>
  );
}
