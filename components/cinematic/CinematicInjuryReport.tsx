// RC2027-INJURY-REPORT: Sam's "Injury report page 1 2027 Final.jpg".
// Approved preview: outer design-explorations/injury-report-2027.
import NativeImage from "@/components/ResilientNativeImage";
import type { InjuryEntryView, InjuryReportView } from "@/lib/cinematic-injury-report-query";
import CinematicInjuryVideo from "./CinematicInjuryVideo";
import "./injury-report.css";

function InjuryCard({ entry }: { entry: InjuryEntryView }) {
  const { player } = entry;
  return <li className="injury-card">
    <span className="injury-photo">{player.photo
      ? <NativeImage src={player.photo.url} width={player.photo.width} height={player.photo.height} alt="" />
      : <span className="injury-photo-empty" aria-hidden="true" />}</span>
    <div className="injury-info">
      <div className="injury-top">
        <h2 className="injury-name">{player.name}{player.number !== null && <> <span className="injury-number">#{player.number}</span></>}</h2>
        <p className="injury-position">{player.position}</p>
      </div>
      <div className="injury-details">
        <p><b>Injury</b> {entry.injury}</p>
        <p><b>Timeline</b> {entry.timeline}</p>
      </div>
      {entry.note && <p className="injury-note">{entry.note}</p>}
    </div>
  </li>;
}

export default function CinematicInjuryReport({ report }: { report: InjuryReportView }) {
  const { page } = report;
  const clear = report.entries.length === 0;
  return <section className="cinematic-injury">
    <header className="injury-heading">
      <h1>Injury Report</h1>
      <p className="injury-presenter"><span>Presented by</span>{report.presenterLogo
        ? <NativeImage className="injury-presenter-logo" src={report.presenterLogo.url} width={report.presenterLogo.width} height={report.presenterLogo.height} alt={page.presenterName} />
        : <span className="injury-presenter-name">{page.presenterName}</span>}</p>
    </header>
    <div className={`injury-body${clear ? " is-clear" : ""}`}>
      {clear
        ? <div className="injury-card injury-clear">
          <div className="injury-info">
            <div className="injury-top"><h2 className="injury-name">No current injuries</h2><p className="injury-position">Full squad</p></div>
            <div className="injury-details"><p>Every player is available for selection.</p></div>
            <p className="injury-note">Check back here for updates on player fitness.</p>
          </div>
        </div>
        : <ol className="injury-list">{report.entries.map(entry => <InjuryCard key={entry.id} entry={entry} />)}</ol>}
      <span className="injury-cross" aria-hidden="true" />
    </div>
    {report.band && <NativeImage className="injury-band" src={report.band.url} width={report.band.width} height={report.band.height} alt={page.bandAlt} />}
    <div className="injury-rehab"><h2>{page.rehabHeading}</h2></div>
    {page.quote && <figure className="injury-quote">
      <span className="injury-quote-mark" aria-hidden="true">“”</span>
      <blockquote><p>“{page.quote}”</p></blockquote>
      {page.quoteAttribution && <figcaption>{page.quoteAttribution}</figcaption>}
    </figure>}
    <CinematicInjuryVideo url={page.videoUrl} title={page.rehabHeading} />
  </section>;
}
