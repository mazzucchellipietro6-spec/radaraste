// Collezioni di contenuti: leggono i file JSON scritti dal pannello Keystatic (src/content/...).
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const text = z.string().default('');
const optNum = z.number().nullish();
const seo = { seoTitle: text, seoDescription: text };

const marbles = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/marbles' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      active: z.boolean().default(true),
      order: z.number().default(10),
      category: z.string().default('altro'),
      tagline: text,
      description: text,
      baseColor: z.array(z.string()).default([]),
      veinColor: z.array(z.string()).default([]),
      veinIntensity: z.string().default('media'),
      veinPattern: z.string().default('fine'),
      visualNotes: text,
      finishes: z.array(z.string()).default([]),
      thicknesses: z.array(z.string()).default([]),
      applications: z.array(z.string()).default([]),
      techSheets: z
        .array(
          z.object({
            title: text,
            file: z.string().nullish(),
            verified: z.boolean().default(false),
            verifiedOn: z.string().nullish(),
            source: text,
          }),
        )
        .default([]),
      slab: image(),
      slabAlt: text,
      detail: image().nullish(),
      detailAlt: text,
      ambient: image().nullish(),
      ambientAlt: text,
      gallery: z.array(z.object({ image: image(), alt: text })).default([]),
      ...seo,
    }),
});

const glossary = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/glossary' }),
  schema: z.object({
    term: z.string(),
    order: z.number().default(10),
    definition: text,
    italianTerm: text,
  }),
});

const experiences = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/experiences' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      active: z.boolean().default(true),
      order: z.number().default(10),
      category: z.string().default('cave'),
      summary: text,
      description: text,
      highlights: z.array(z.string()).default([]),
      duration: text,
      languages: z.array(z.string()).default([]),
      minParticipants: optNum,
      maxParticipants: optNum,
      price: optNum,
      priceUnit: z.enum(['persona', 'gruppo']).default('persona'),
      priceNote: text,
      onlinePayment: z.boolean().default(false),
      meetingPoint: text,
      image: image(),
      imageAlt: text,
      ...seo,
    }),
});

const destinations = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/destinations' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      active: z.boolean().default(true),
      featured: z.boolean().default(false),
      order: z.number().default(10),
      region: z.string(),
      tagline: text,
      description: text,
      attractions: z.array(z.string()).default([]),
      experiences: z.array(z.string()).default([]),
      itineraries: z.array(z.object({ title: text, text: text })).default([]),
      privateTours: z.boolean().default(true),
      transfer: z.boolean().default(true),
      guides: z.boolean().default(true),
      image: image(),
      imageAlt: text,
      ...seo,
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      active: z.boolean().default(false),
      clientConsent: z.boolean().default(false),
      type: z.string().default('residenziale'),
      location: text,
      year: optNum,
      summary: text,
      description: text,
      marbles: z.array(z.string()).default([]),
      cover: image().nullish(),
      gallery: z.array(z.object({ image: image(), alt: text })).default([]),
    }),
});

const legal = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/legal' }),
  schema: z.object({ title: z.string(), updated: z.string().nullish(), body: text }),
});

const settings = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/settings' }),
  schema: ({ image }) =>
    z.object({
      brand: z.string().optional(),
      legalName: z.string().optional(),
      vatNumber: z.string().optional(),
      rea: z.string().optional(),
      pec: z.string().optional(),
      address: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      instagram: z.string().optional(),
      mapLat: optNum,
      mapLng: optNum,
      iubendaPolicyId: z.string().optional(),
      iubendaCookieId: z.string().optional(),
      hero: image().optional(),
      showroom: image().optional(),
      matching: image().optional(),
      experience: image().optional(),
      consultancy: image().optional(),
      export: image().optional(),
    }),
});

export const collections = { marbles, glossary, experiences, destinations, projects, legal, settings };
