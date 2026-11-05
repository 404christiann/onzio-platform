import type { RobinsonContent } from '@/lib/cinematic-robinson-content';

export const robinsonFacts = [
  { label: 'On-Site Parking', value: 'Yes' },
  { label: 'Mobile Tickets', value: 'Yes' },
  { label: 'Food Allowed', value: 'Yes' },
  { label: 'Pets Allowed', value: 'No' },
  { label: 'Snack Bar', value: 'Yes' },
  { label: 'Wi-Fi', value: 'No' },
] as const;

export const robinsonIntroduction = 'Rose City FC will play home games at the historic Robinson Stadium. With 4,599 seats to choose from, there are no bad views while watching the match.';
export const robinsonHistory = 'In 2001, Pasadena City College named Robinson Stadium after the legendary Jackie and Mack Robinson. The Robinson brothers moved to Pasadena with their mother in 1920. Jackie, then one year old, and Mack, four years older, lived on Pepper Street. They attended John Muir High School and later Pasadena Junior College, now known as Pasadena City College. Jackie was inducted into the National Baseball Hall of Fame in July 1962. His iconic #42 jersey is retired league-wide. Mack finished second in the 200-meter final at the 1936 Olympics, just four-tenths of a second behind Jesse Owens. Mack was inducted into the UO Hall of Fame in 1995. The City of Pasadena has memorialized Jackie and Mack Robinson with two monumental bronze portrait heads situated across from City Hall in Pasadena, California.';
export const robinsonQuote = 'People just don’t realize how much sports history we have in Pasadena. We’ve had over 16 athletes go pro just in soccer. I tell people all the time Pasadena is the greatest city in the world. We have the Rose Bowl, Rose Parade, museums, Caltech, and NASA’s JPL all in our backyard. We even have a United States Navy submarine named after us called the USS Pasadena (SSN-752). To have Rose City FC play at Robinson Stadium is super exciting for us, and we can’t wait till kickoff!';
export const robinsonFoodBody = 'This exclusive partnership with Chick-fil-A® Pasadena allows you to enjoy\nChick-fil-A® at every Rose City FC home game at Robinson Stadium.\nSimply drive-thru Chick-fil-A®, place your order, and enjoy it at the game.\nAdditionally, you’ll receive a Rose City FC ticket to the game\nand automatically be entered into the halftime raffle.';
export const robinsonLine187Destinations = 'Old Town Pasadena, Pacific Asia Museum, California School of Culinary Arts, Target, Paul Mitchell the School, North-West College–Pasadena, Pasadena City College, Pasadena YMCA, Pasadena City College – Community Education Center, Vons, Michillinda Park, Ralphs, Sprouts Farmers Market, Grocery Outlet, H Mart, The Shops at Santa Anita, Methodist Hospital of Southern California, Santa Anita Golf Course, Arcadia Community Regional Park, Santa Anita Race Track, Girl Scouts of Greater Los Angeles – Central Region – Arcadia Service Center, Arcadia Adult School, Baja Ranch, Mt. Sierra College, Old Town Monrovia, Monrovia Community Adult School, Opportunities for Learning, Smart & Final, Tropicana Market, City of Duarte Parks and Recreation Department, Costco, and the Santa Fe Dam Recreational Area.';

/**
 * Christian's confirmed Robinson copy (2026-11-04), stored as the page's starting content by
 * scripts/seed-rose-city-robinson-2027-local.ts. Both the story's 2001 and the info card's 1999 stay as supplied.
 * Image identities are filled in by the seed; descriptions match the approved static page.
 */
export const robinsonReferenceContent: RobinsonContent = {
  heading: { visible: true, title: 'Robinson Stadium', subtitle: 'Pasadena, California' },
  seating: { visible: true, caption: 'Home Field Advantage', expandLabel: 'View stadium map full size' },
  story: { visible: true, paragraphs: [robinsonIntroduction, robinsonHistory], quote: robinsonQuote, attribution: 'GM Samuel Whitworth' },
  info: { visible: true, heading: 'Stadium Info', note: 'Dedicated as Robinson Stadium in 1999', rows: robinsonFacts.map(fact => ({ label: fact.label, available: fact.value === 'Yes' })) },
  match: { visible: true },
  lockers: { visible: true },
  food: { visible: true, heading: 'Food & Beverage', body: robinsonFoodBody, steps: [{ label: 'Drive-Thru' }, { label: 'Free Game Ticket' }, { label: 'Enjoy during Game' }] },
  route: { visible: true, heading: 'Road to the Match', subheading: 'Watch Rose City FC live and save on gas' },
  directions: { visible: true, blocks: [
    { id: 'foothill-transit', heading: 'Directions By Foothill Transit', note: '', bullets: [], closing: '', paragraphs: [
      'Getting to Rose City FC games at Robinson Stadium is easy with Foothill Transit.',
      'Take Line 187 to Colorado Blvd and Sierra Bonita Ave E.',
      'The Line 187 stop at Colorado Blvd and Sierra Bonita Ave E is in front of Pasadena City College.',
      'The stadium is about a five-minute walk from the bus stop.',
    ] },
    { id: 'parking-lot-no-5', heading: 'Parking Lot No. 5', note: 'Parking Lot No. 5 is on S. Bonnie Ave.', bullets: [], closing: '', paragraphs: [
      'You may purchase daily parking permits for $2.00 a day from the yellow parking permit machines located on every level of the parking lots throughout the main and CEC campuses. All daily parking permit machines accept $1 bills.',
    ] },
    { id: 'line-187', heading: 'Line 187: Azusa – Arcadia – Pasadena', note: '', bullets: [], closing: '', paragraphs: [
      'Line 187 serves Pasadena, East Pasadena, East San Gabriel, Arcadia, Monrovia, Duarte, Irwindale, and Azusa.',
      `Visit one of the many popular destinations located along Line 187, such as ${robinsonLine187Destinations}`,
    ] },
    { id: 'service-areas', heading: 'Foothill Transit Service Areas', note: '', paragraphs: [], bullets: [
      'San Gabriel Valley: Local routes run through cities like El Monte, West Covina, Azusa, Glendora, and Pomona.',
      'Downtown Los Angeles: Express and rapid commuter buses travel from the El Monte Busway directly into DTLA.',
      'Neighboring Counties: Select local routes reach edge cities in San Bernardino County (like Montclair) and Orange County.',
    ], closing: 'You can check routes and plan trips using the Foothill Transit Trip Planner.' },
  ] },
  images: {
    seating: { assetId: null, alt: 'Robinson Stadium field, stands, vendor area and general seats layout diagram supplied by Rose City FC' },
    lockers: { assetId: null, alt: '' },
    mealPass: { assetId: null, alt: 'Rose City FC meal pass presented by Chick-fil-A Pasadena' },
    step1: { assetId: null, alt: '' },
    step2: { assetId: null, alt: '' },
    step3: { assetId: null, alt: '' },
    bus: { assetId: null, alt: 'Foothill Transit bus' },
    routeMap: { assetId: null, alt: 'Line 187 stop and walking route to Robinson Stadium and Parking Lot No. 5' },
    partner: { assetId: null, alt: 'Chick-fil-A · E. Colorado Blvd / Lake & Boylston' },
  },
};
