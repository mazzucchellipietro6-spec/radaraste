// Catalogo dei marmi già tradotto, con immagini ottimizzate: usato da showroom, selezione,
// confronto, Marble Matching e Marble Concierge.
import { getImage } from 'astro:assets';
import type { Translator } from '~/i18n';
import { marbles } from './site';

export interface CatalogueItem {
  slug: string;
  name: string;
  category: string;
  categoryLabel: string;
  tagline: string;
  url: string;
  thumb: string;
  slab: string;
  zoom: string;
  detail: string | null;
  alt: string;
  baseColor: string[];
  veinColor: string[];
  veinIntensity: string;
  veinPattern: string;
  finishes: string[];
  thicknesses: string[];
  applications: string[];
  labels: Record<string, string[]>;
}

export async function catalogue(tr: Translator): Promise<CatalogueItem[]> {
  const list = await marbles();
  const v = (g: string, k: string) => tr.t(`vocab.${g}.${k}`);
  return Promise.all(
    list.map(async (m) => {
      const d = tr.localize('marbles', m.id, m.data);
      const [thumb, slab, zoom, detail] = await Promise.all([
        getImage({ src: d.slab, width: 640, format: 'webp', quality: 74 }),
        getImage({ src: d.slab, width: 1600, format: 'webp', quality: 78 }),
        getImage({ src: d.slab, width: Math.min(2400, d.slab.width), format: 'webp', quality: 82 }),
        d.detail ? getImage({ src: d.detail, width: 1600, format: 'webp', quality: 80 }) : Promise.resolve(null),
      ]);
      return {
        slug: m.id,
        name: d.name,
        category: d.category,
        categoryLabel: v('category', d.category),
        tagline: d.tagline,
        url: tr.href('marble', m.id),
        thumb: thumb.src,
        slab: slab.src,
        zoom: zoom.src,
        detail: detail?.src ?? null,
        alt: d.slabAlt,
        baseColor: d.baseColor,
        veinColor: d.veinColor,
        veinIntensity: d.veinIntensity,
        veinPattern: d.veinPattern,
        finishes: d.finishes,
        thicknesses: d.thicknesses,
        applications: d.applications,
        labels: {
          baseColor: d.baseColor.map((x) => v('baseColor', x)),
          veinColor: d.veinColor.map((x) => v('veinColor', x)),
          veinIntensity: [v('veinIntensity', d.veinIntensity)],
          veinPattern: [v('veinPattern', d.veinPattern)],
          finishes: d.finishes.map((x) => v('finish', x)),
          applications: d.applications.map((x) => v('application', x)),
        },
      };
    }),
  );
}
