// Accesso ai contenuti del pannello (Keystatic) già filtrati e ordinati.
import { getCollection, getEntry } from 'astro:content';

export async function company() {
  const e = await getEntry('settings', 'company');
  const d = e?.data ?? {};
  return {
    brand: d.brand || 'WHITE CARRARA',
    legalName: d.legalName || '',
    vatNumber: d.vatNumber || '',
    rea: d.rea || '',
    pec: d.pec || '',
    address: d.address || '54033 Carrara (MS), Toscana, Italia',
    email: d.email || '',
    phone: d.phone || '',
    whatsapp: (d.whatsapp || '').replace(/\D/g, ''),
    instagram: (d.instagram || '').replace(/^@/, ''),
    mapLat: d.mapLat ?? null,
    mapLng: d.mapLng ?? null,
    iubendaPolicyId: d.iubendaPolicyId || '',
    iubendaCookieId: d.iubendaCookieId || '',
  };
}
export type Company = Awaited<ReturnType<typeof company>>;

export async function homeImages() {
  const e = await getEntry('settings', 'home');
  return e?.data ?? {};
}

const byOrder = <T extends { data: { order?: number } }>(a: T, b: T) => (a.data.order ?? 0) - (b.data.order ?? 0);

export const marbles = async () => (await getCollection('marbles', (e) => e.data.active)).sort(byOrder);
export const experiences = async () => (await getCollection('experiences', (e) => e.data.active)).sort(byOrder);
export const destinations = async () => (await getCollection('destinations', (e) => e.data.active)).sort(byOrder);
export const glossary = async () => (await getCollection('glossary')).sort(byOrder);
export const projects = async () =>
  (await getCollection('projects', (e) => e.data.active && e.data.clientConsent)).sort(
    (a, b) => (b.data.year ?? 0) - (a.data.year ?? 0),
  );

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
export const whatsappHref = (number: string, text?: string) =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const instagramHref = (handle: string) => `https://www.instagram.com/${handle}/`;
