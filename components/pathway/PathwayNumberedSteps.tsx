import {
  PathwaySection,
  PathwaySectionHead,
  type PathwayTone,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.numbered-steps — an ordered process explanation, each step
 * carrying a cost figure (MLA P1 Step 5). Used to explain the UPSL
 * entry/payment process.
 *
 * Informational display only, and deliberately so: there is no payment
 * backend in Phase 1, so this section renders no buttons, no forms and
 * nothing that could be mistaken for a transaction. The registry entry for
 * pathway.numbered-steps says the same thing — payment collection is
 * excluded by design, not by omission.
 *
 * `cost` is a union so a step whose real figure is not yet known renders an
 * explicit TBC rather than an invented number, matching the same rule
 * PathwaySpecList follows.
 */

export type PathwayStepCost = { amount: string; note?: string } | { state: "tbc" };

export type PathwayStep = {
  title: string;
  body: string;
  cost: PathwayStepCost;
};

export type PathwayNumberedStepsProps = {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  steps: PathwayStep[];
  /**
   * Line under the list. Should keep saying, in the club's own words, that
   * these figures are informational and not collected on the site.
   */
  disclaimer?: string;
  tone?: PathwayTone;
};

function isTbcCost(cost: PathwayStepCost): cost is { state: "tbc" } {
  return "state" in cost;
}

export default function PathwayNumberedSteps({
  eyebrow,
  heading,
  intro,
  steps,
  disclaimer,
  tone = "light",
}: PathwayNumberedStepsProps) {
  if (steps.length === 0) return null;

  return (
    <PathwaySection tone={tone} className="pathway-steps-section">
      <PathwaySectionHead eyebrow={eyebrow} heading={heading} intro={intro} />
      <ol className="pathway-steps">
        {steps.map((step, index) => (
          <li className="pathway-step" key={step.title}>
            <span className="pathway-step-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="pathway-step-copy">
              <h3 className="pathway-step-title">{step.title}</h3>
              <p className="pathway-step-body">{step.body}</p>
            </div>
            <div className="pathway-step-cost" data-state={isTbcCost(step.cost) ? "tbc" : "resolved"}>
              {isTbcCost(step.cost) ? (
                <>
                  <span className="pathway-spec-badge">TBC</span>
                  <span className="pathway-spec-tbc-text">Cost to be confirmed</span>
                </>
              ) : (
                <>
                  <span className="pathway-step-amount">{step.cost.amount}</span>
                  {step.cost.note && (
                    <span className="pathway-step-cost-note">{step.cost.note}</span>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      {disclaimer && <p className="pathway-disclaimer">{disclaimer}</p>}
    </PathwaySection>
  );
}
