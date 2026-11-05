import NativeImage from "@/components/ResilientNativeImage";
import { partnerAction, type CinematicPartnersContent, type PartnerPage } from "@/lib/cinematic-partners-content";
import "./partners.css";

export type CinematicPartnersProps = {
  page: PartnerPage;
  content: CinematicPartnersContent;
  /** Public URLs of the published logos, keyed by media asset id. */
  logoUrls: Record<string, string>;
};

export default function CinematicPartners({ page, content, logoUrls }: CinematicPartnersProps) {
  const copy = content.pages[page];
  const action = partnerAction(content, page);
  return <div className="partner-page">
    <header className="partner-heading"><div><h1>{copy.title}</h1>{copy.subtitle.trim() && <p>{copy.subtitle}</p>}</div></header>
    {(copy.intro.trim() || content.partners.length > 0) && <section className="partner-body" aria-label={copy.title}>
      {copy.intro.trim() && <p className="partner-intro">{copy.intro}</p>}
      {content.partners.length > 0 && <div className="partner-grid">{content.partners.map(partner => {
        const url = partner.logoAssetId ? logoUrls[partner.logoAssetId] : undefined;
        return <article key={partner.id} className={`partner-card partner-tone-${partner.tone}`}>
          <div className="partner-logo">{url
            ? <NativeImage src={url} alt={partner.name} />
            : <div className="partner-pending"><span>{partner.name}</span><small>Original logo pending</small></div>}</div>
          {partner.role.trim() && <p>{partner.role}</p>}
        </article>;
      })}</div>}
    </section>}
    {action && <aside className="partner-action"><p>{action.prompt}</p><a href={action.href}>{action.label}</a></aside>}
  </div>;
}
