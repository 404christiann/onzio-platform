import CinematicStadium, { type StadiumTicketing } from './CinematicStadium';
import NativeImage from '@/components/ResilientNativeImage';
import type { StadiumPageContent } from '@/lib/stadium-content';
import { robinsonFacts, robinsonFoodBody, robinsonHistory, robinsonIntroduction, robinsonLine187Destinations, robinsonQuote } from '@/lib/robinson-reference-content';
import './robinson-page.css';

const imageRoot = '/rose-city/robinson';
const foodSteps = [
  { label: 'Drive-Thru', image: 'drive-thru.png' },
  { label: 'Free Game Ticket', image: 'free-ticket.png' },
  { label: 'Enjoy during Game', image: 'enjoy-game.png' },
];

export default function CinematicRobinson({ foothillContent, ticketing }: { foothillContent: StadiumPageContent; ticketing: StadiumTicketing }) {
  const matchOnly = { ...foothillContent, showHeading: false, showMap: false, showSections: false, showBenefits: false, showMatch: true };
  return <div className="new-robinson">
    <section className="r-heading" aria-labelledby="r-title"><h1 id="r-title">Robinson Stadium</h1><p>Pasadena, California</p></section>
    <figure className="r-seating"><NativeImage src={`${imageRoot}/seating.jpg`} alt="Robinson Stadium field, stands, vendor area and general seats layout diagram supplied by Rose City FC" /><a className="r-map-expand" href={`${imageRoot}/seating.jpg`} target="_blank" rel="noopener noreferrer">View stadium map full size</a><figcaption>Home Field Advantage</figcaption></figure>
    <section className="r-story" aria-label="Stadium story"><p>{robinsonIntroduction}</p><p>{robinsonHistory}</p><blockquote><p>“{robinsonQuote}”</p><footer>– GM Samuel Whitworth</footer></blockquote></section>
    <section className="r-cards" aria-label="Stadium details and next home match"><article className="r-info-card"><h2>Stadium Info</h2><p className="r-info-note">Dedicated as Robinson Stadium in 1999</p><dl>{robinsonFacts.map(fact => <div key={fact.label}><dt>{fact.label}:</dt><dd data-available={fact.value === 'Yes'}>{fact.value}</dd></div>)}</dl></article><CinematicStadium content={matchOnly} ticketing={ticketing} /></section>
    <div id="lockers" className="r-locker-divider" aria-hidden="true"><NativeImage src={`${imageRoot}/lockers.png`} alt="" /></div>
    <section className="r-food" aria-labelledby="r-food-title"><div className="r-food-header"><div className="r-food-title-row"><h2 id="r-food-title">Food &amp; Beverage</h2><span aria-hidden="true" /></div></div><div className="r-food-content"><div className="r-food-body"><NativeImage src={`${imageRoot}/meal-pass.png`} alt="Rose City FC meal pass presented by Chick-fil-A Pasadena" /><p>{robinsonFoodBody}</p></div><div className="r-food-steps">{foodSteps.map((step, index) => <div key={step.label}><NativeImage src={`${imageRoot}/${step.image}`} alt="" /><p>{step.label}</p><strong>{index + 1}</strong></div>)}</div></div></section>
    <section className="r-route" aria-labelledby="r-route-title"><div className="r-route-heading"><div><h2 id="r-route-title">Road to the Match</h2><p>Watch Rose City FC live and save on gas</p></div><NativeImage src={`${imageRoot}/bus.png`} alt="Foothill Transit bus" /></div><NativeImage className="r-route-map" src={`${imageRoot}/route-map.png`} alt="Line 187 stop and walking route to Robinson Stadium and Parking Lot No. 5" /><div className="r-directions"><h3>Directions By Foothill Transit</h3><p>Getting to Rose City FC games at Robinson Stadium is easy with Foothill Transit.</p><p>Take Line 187 to Colorado Blvd and Sierra Bonita Ave E.</p><p>The Line 187 stop at Colorado Blvd and Sierra Bonita Ave E is in front of Pasadena City College.</p><p>The stadium is about a five-minute walk from the bus stop.</p><h3 id="parking-lot-no-5">Parking Lot No. 5</h3><p>You may purchase daily parking permits for $2.00 a day from the yellow parking permit machines located on every level of the parking lots throughout the main and CEC campuses. All daily parking permit machines accept $1 bills.</p><p className="r-parking-note">Parking Lot No. 5 is on S. Bonnie Ave.</p><h3>Line 187: Azusa – Arcadia – Pasadena</h3><p>Line 187 serves Pasadena, East Pasadena, East San Gabriel, Arcadia, Monrovia, Duarte, Irwindale, and Azusa.</p><p>Visit one of the many popular destinations located along Line 187, such as {robinsonLine187Destinations}</p><h3>Foothill Transit Service Areas</h3><ul><li>San Gabriel Valley: Local routes run through cities like El Monte, West Covina, Azusa, Glendora, and Pomona.</li><li>Downtown Los Angeles: Express and rapid commuter buses travel from the El Monte Busway directly into DTLA.</li><li>Neighboring Counties: Select local routes reach edge cities in San Bernardino County (like Montclair) and Orange County.<span className="r-route-planner">You can check routes and plan trips using the Foothill Transit Trip Planner.</span></li></ul></div></section>
  </div>;
}
