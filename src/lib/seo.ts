// Dati strutturati schema.org (Google) e piccoli aiuti per la SEO.
import type { Translator } from '~/i18n';
import type { Company } from './site';

const site = () => (import.meta.env.SITE ?? 'http://localhost:4321').replace(/\/$/, '');

export function orgJsonLd(tr: Translator, c: Company) {
  const sameAs = c.instagram ? [`https://www.instagram.com/${c.instagram}/`] : [];
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'LocalBusiness'],
    '@id': `${site()}/#organization`,
    name: 'WHITE CARRARA',
    slogan: 'From Carrara to the World.',
    description: tr.t('meta.defaultDescription'),
    url: `${site()}/`,
    ...(c.legalName ? { legalName: c.legalName } : {}),
    ...(c.vatNumber ? { vatID: c.vatNumber } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.phone ? { telephone: c.phone } : {}),
    address: {
      '@type': 'PostalAddress',
      postalCode: '54033',
      addressLocality: 'Carrara',
      addressRegion: 'MS',
      addressCountry: 'IT',
    },
    ...(c.mapLat && c.mapLng ? { geo: { '@type': 'GeoCoordinates', latitude: c.mapLat, longitude: c.mapLng } } : {}),
    areaServed: 'Worldwide',
    sameAs,
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${site()}${it.url}` })),
  };
}

export const absUrl = (path: string) => `${site()}${path}`;
