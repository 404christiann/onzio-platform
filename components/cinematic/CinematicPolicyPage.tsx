import type { CinematicPolicyPage as PolicyPage, CinematicPolicyRow } from "@/lib/cinematic-policies-content";
import "./policies.css";

const lines = (row: CinematicPolicyRow) => row.blocks.filter(line => line.text.trim());
const answered = (row: CinematicPolicyRow) => lines(row).length > 0;

// icons.download thin/outline/round caret-down (Sam's thin chevron); takes Sam's red through currentColor.
function Caret() {
  return <svg className="policy-caret" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4.76273 8.54513L12.0106 15.793L19.2584 8.54513C19.2828 8.52072 19.3091 8.49936 19.3369 8.48106C19.5309 8.35292 19.7947 8.37427 19.9655 8.54513C20.1608 8.74039 20.1608 9.05697 19.9655 9.25224L12.3641 16.8536C12.2704 16.9474 12.1432 17.0001 12.0106 17.0001C11.878 17.0001 11.7508 16.9474 11.657 16.8536L4.05563 9.25223C3.8863 9.08291 3.86381 8.82234 3.98816 8.62878C4.0072 8.59913 4.02969 8.57106 4.05563 8.54513C4.08003 8.52072 4.10634 8.49936 4.13406 8.48106C4.20104 8.43684 4.27631 8.41042 4.3532 8.40181C4.3718 8.39972 4.39049 8.39868 4.40918 8.39868C4.53714 8.39868 4.6651 8.4475 4.76273 8.54513Z" /></svg>;
}

/** Sam's shared accordion layout for Stadium Guidelines and Fan Code of Conduct. */
export default function CinematicPolicyPage({ page }: { page: PolicyPage }) {
  return <div className="policy-page">
    <header className="policy-heading"><div><h1>{page.title}</h1>{page.subtitle.trim() && <p>{page.subtitle}</p>}</div></header>
    <section className="policy-body" aria-label={page.heading.trim() ? undefined : page.title}>
      {page.heading.trim() && <h2>{page.heading}</h2>}
      {page.rows.length === 0 ? <p className="policy-empty">Details coming soon.</p> :
        <div className="policy-rows">
          {page.rows.map(row => <details key={row.id} className="policy-row" open={answered(row)}>
            <summary><h3>{row.heading}</h3><Caret /></summary>
            <div className="policy-answer">
              {answered(row) ? lines(row).map((line, i) => line.kind === "subheading" ? <h4 key={i}>{line.text}</h4> : <p key={i}>{line.text}</p>)
                : <p className="policy-pending">Details coming soon.</p>}
            </div>
          </details>)}
        </div>}
    </section>
  </div>;
}
