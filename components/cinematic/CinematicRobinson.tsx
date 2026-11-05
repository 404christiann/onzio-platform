import { Fragment } from 'react';
import CinematicStadium, { type StadiumTicketing } from './CinematicStadium';
import NativeImage from '@/components/ResilientNativeImage';
import type { RobinsonBlock, RobinsonImage, RobinsonPageContent } from '@/lib/cinematic-robinson-content';
import { emptyStadiumContent, hydrateStadiumContent } from '@/lib/stadium-content';
import './robinson-page.css';

const STEP_SLOTS = ['step1', 'step2', 'step3'] as const;
const picture = (image: RobinsonImage, className?: string) => image.url ? <NativeImage className={className} src={image.url} alt={image.alt} /> : null;

/** Flat siblings: robinson-page.css styles `.r-directions > p` and `h3:last-of-type`. */
function DirectionsBlock({ block }: { block: RobinsonBlock }) {
  const last = block.bullets.length - 1;
  return <>
    {block.heading && <h3 id={block.id}>{block.heading}</h3>}
    {block.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    {block.note && <p className="r-parking-note">{block.note}</p>}
    {block.bullets.length > 0 && <ul>{block.bullets.map((bullet, index) => <li key={index}>{bullet}{index === last && block.closing && <span className="r-route-planner">{block.closing}</span>}</li>)}</ul>}
    {block.bullets.length === 0 && block.closing && <p className="r-route-planner">{block.closing}</p>}
  </>;
}

/** Robinson Stadium (/stadium). Owner content from /admin/stadium; fixture from Schedule, match wording from Homepage, purchase from Tickets. */
export default function CinematicRobinson({ content, ticketing }: { content: RobinsonPageContent; ticketing: StadiumTicketing }) {
  const { heading, seating, story, info, match, lockers, food, route, directions, images } = content;
  const matchCard = { ...hydrateStadiumContent(emptyStadiumContent(), []), showHeading: false, showMap: false, showSections: false, showBenefits: false, showMatch: true };
  matchCard.artwork.partner = images.partner;
  return <div className="new-robinson">
    {heading.visible && <section className="r-heading" aria-labelledby="r-title"><h1 id="r-title">{heading.title}</h1>{heading.subtitle && <p>{heading.subtitle}</p>}</section>}
    {seating.visible && <figure className="r-seating">{picture(images.seating)}{images.seating.url && <a className="r-map-expand" href={images.seating.url} target="_blank" rel="noopener noreferrer">{seating.expandLabel}</a>}{seating.caption && <figcaption>{seating.caption}</figcaption>}</figure>}
    {story.visible && <section className="r-story" aria-label="Stadium story">{story.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{story.quote && <blockquote><p>“{story.quote}”</p>{story.attribution && <footer>– {story.attribution}</footer>}</blockquote>}</section>}
    {(info.visible || match.visible) && <section className="r-cards" aria-label="Stadium details and next home match">
      {info.visible && <article className="r-info-card"><h2>{info.heading}</h2>{info.note && <p className="r-info-note">{info.note}</p>}<dl>{info.rows.map((row, index) => <div key={index}><dt>{row.label}:</dt><dd data-available={row.available}>{row.available ? 'Yes' : 'No'}</dd></div>)}</dl></article>}
      {match.visible && <CinematicStadium content={matchCard} ticketing={ticketing} />}
    </section>}
    {lockers.visible && <div id="lockers" className="r-locker-divider" aria-hidden="true">{picture(images.lockers)}</div>}
    {food.visible && <section className="r-food" aria-labelledby="r-food-title"><div className="r-food-header"><div className="r-food-title-row"><h2 id="r-food-title">{food.heading}</h2><span aria-hidden="true" /></div></div><div className="r-food-content"><div className="r-food-body">{picture(images.mealPass)}<p>{food.body}</p></div><div className="r-food-steps">{food.steps.map((step, index) => <div key={index}>{picture(images[STEP_SLOTS[index]])}<p>{step.label}</p><strong>{index + 1}</strong></div>)}</div></div></section>}
    {(route.visible || directions.visible) && <section className="r-route" {...(route.visible ? { 'aria-labelledby': 'r-route-title' } : { 'aria-label': 'Directions' })}>
      {route.visible && <><div className="r-route-heading"><div><h2 id="r-route-title">{route.heading}</h2>{route.subheading && <p>{route.subheading}</p>}</div>{picture(images.bus)}</div>{picture(images.routeMap, 'r-route-map')}</>}
      {directions.visible && <div className="r-directions">{directions.blocks.map(block => <Fragment key={block.id}><DirectionsBlock block={block} /></Fragment>)}</div>}
    </section>}
  </div>;
}
