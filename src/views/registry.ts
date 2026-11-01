// Elenco delle pagine pubbliche: chiave del percorso -> componente.
import Home from './Home.astro';
import Marbles from './Marbles.astro';
import Marble from './Marble.astro';
import Showroom from './Showroom.astro';
import Selection from './Selection.astro';
import Matching from './Matching.astro';
import Concierge from './Concierge.astro';
import Experience from './Experience.astro';
import ExperienceItem from './ExperienceItem.astro';
import Tours from './Tours.astro';
import Destination from './Destination.astro';
import CustomTrip from './CustomTrip.astro';
import Booking from './Booking.astro';
import Projects from './Projects.astro';
import Trade from './Trade.astro';
import About from './About.astro';
import Contact from './Contact.astro';
import QuotePage from './QuotePage.astro';
import Glossary from './Glossary.astro';
import B2B from './B2B.astro';
import Legal from './Legal.astro';
import { destinations, experiences, marbles } from '~/lib/site';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const VIEWS: Record<string, any> = {
  home: Home,
  marbles: Marbles,
  marble: Marble,
  showroom: Showroom,
  selection: Selection,
  matching: Matching,
  concierge: Concierge,
  experience: Experience,
  experienceItem: ExperienceItem,
  tours: Tours,
  destination: Destination,
  customTrip: CustomTrip,
  booking: Booking,
  projects: Projects,
  trade: Trade,
  about: About,
  contact: Contact,
  quote: QuotePage,
  glossary: Glossary,
  b2b: B2B,
  privacy: Legal,
  cookies: Legal,
  terms: Legal,
  legalNotice: Legal,
};

/** Pagine legali: chiave del percorso -> documento nella collezione "legal". */
const LEGAL: Record<string, string> = { privacy: 'privacy', cookies: 'cookies', terms: 'terms', legalNotice: 'legal-notice' };

/** Pagine da generare per ogni lingua. */
export async function staticPages(): Promise<{ key: string; id?: string }[]> {
  const pages: { key: string; id?: string }[] = Object.keys(VIEWS)
    .filter((k) => !['marble', 'experienceItem', 'destination'].includes(k))
    .map((key) => ({ key, id: LEGAL[key] }));
  for (const m of await marbles()) pages.push({ key: 'marble', id: m.id });
  for (const e of await experiences()) pages.push({ key: 'experienceItem', id: e.id });
  for (const d of await destinations()) pages.push({ key: 'destination', id: d.id });
  return pages;
}
