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
};

/** Pagine da generare per ogni lingua. */
export async function staticPages(): Promise<{ key: string; id?: string }[]> {
  const pages: { key: string; id?: string }[] = Object.keys(VIEWS)
    .filter((k) => !['marble', 'experienceItem', 'destination'].includes(k))
    .map((key) => ({ key }));
  if (VIEWS.marble) for (const m of await marbles()) pages.push({ key: 'marble', id: m.id });
  if (VIEWS.experienceItem) for (const e of await experiences()) pages.push({ key: 'experienceItem', id: e.id });
  if (VIEWS.destination) for (const d of await destinations()) pages.push({ key: 'destination', id: d.id });
  return pages;
}
