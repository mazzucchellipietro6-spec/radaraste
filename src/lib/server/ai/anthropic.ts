// Claude (Anthropic) per Marble Matching e Marble Concierge.
// Modello predefinito: claude-opus-5-5 (cambiabile con AI_MODEL). Uscita in JSON validato da uno schema.
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';
import type { AiProvider, CatalogueHint, ConciergeAdvice, MarbleAnalysis } from './index';

const DEFAULT_MODEL = 'claude-opus-5-5';
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: 90_000, maxRetries: 2 });
  return client;
}

const model = () => env('AI_MODEL') ?? DEFAULT_MODEL;
const effort = () => (env('AI_EFFORT') as Effort | undefined) ?? 'medium';

function catalogueText(list: CatalogueHint[]) {
  return list
    .map(
      (m) =>
        `- slug: ${m.slug}\n  name: ${m.name}\n  family: ${m.category}\n  background colour: ${m.baseColor.join(', ')}\n  vein colour: ${m.veinColor.join(', ')}\n  vein intensity: ${m.veinIntensity}\n  vein pattern: ${m.veinPattern}\n  notes: ${m.visualNotes.replace(/\s+/g, ' ').trim()}`,
    )
    .join('\n');
}

const SYSTEM = `You are the natural-stone specialist of WHITE CARRARA, a company in Carrara (Italy) that sources Italian marble through suppliers and partners.
You compare what is visible in a photograph with the company's catalogue. You describe appearance only: background colour, veining colour, density, direction and contrast.
A photograph alone can never establish the geological identity, origin or quality of a stone: never state that the photo "is" a specific marble, only that it looks similar. Lighting, camera and finish change how stone looks.
Do not invent technical properties, prices or availability. Write every text field in the language requested by the user, in a calm, precise, courteous tone.`;

async function structured<T>(params: { system: string; content: Anthropic.Beta.BetaContentBlockParam[]; schema: Record<string, unknown> }): Promise<T | null> {
  const response = await getClient().beta.messages.create({
    model: model(),
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: params.system,
    output_config: { effort: effort(), format: { type: 'json_schema', schema: params.schema } },
    messages: [{ role: 'user', content: params.content }],
  });
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    console.warn(`[ai] risposta non utilizzabile (${response.stop_reason})`);
    return null;
  }
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function anthropicProvider(): AiProvider {
  return {
    name: 'anthropic',

    async analyzeMarble({ image, mediaType, language, catalogue }) {
      const slugs = catalogue.map((c) => c.slug);
      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['isStone', 'analysis', 'matches', 'caveat'],
        properties: {
          isStone: { type: 'boolean', description: 'false if the photo does not show marble or natural stone' },
          analysis: {
            type: 'object',
            additionalProperties: false,
            required: ['background', 'veins', 'pattern', 'notes'],
            properties: {
              background: { type: 'string' },
              veins: { type: 'string' },
              pattern: { type: 'string' },
              notes: { type: 'string' },
            },
          },
          matches: {
            type: 'array',
            description: 'The three most visually similar catalogue items, best first',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['slug', 'similarity', 'reasons'],
              properties: {
                slug: { type: 'string', enum: slugs },
                similarity: { type: 'string', enum: ['high', 'medium', 'low'] },
                reasons: { type: 'string', description: 'One or two sentences explaining the visual similarities and the main differences' },
              },
            },
          },
          caveat: { type: 'string', description: 'A short reminder that the suggestion must be confirmed on real samples' },
        },
      };
      return structured<MarbleAnalysis>({
        system: SYSTEM,
        schema,
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } },
          {
            type: 'text',
            text: `Catalogue:\n${catalogueText(catalogue)}\n\nAnalyse the colours and veining in the photo, then choose the three catalogue items (by slug) that look most similar, best first. Explain the similarities and the most visible differences for each. If the photo does not show marble or natural stone, set isStone to false and return an empty matches list. Write all text in this language: ${language}.`,
          },
        ],
      }).then((r) => (r ? { ...r, matches: r.matches.filter((m) => slugs.includes(m.slug)).slice(0, 3) } : null));
    },

    async conciergeAdvice({ language, brief, candidates }): Promise<ConciergeAdvice | null> {
      const slugs = candidates.map((c) => c.slug);
      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['intro', 'picks'],
        properties: {
          intro: { type: 'string' },
          picks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['slug', 'why'],
              properties: { slug: { type: 'string', enum: slugs }, why: { type: 'string' } },
            },
          },
        },
      };
      const r = await structured<ConciergeAdvice>({
        system: SYSTEM,
        schema,
        content: [
          {
            type: 'text',
            text: `A client described a project:\n${JSON.stringify(brief, null, 2)}\n\nCandidate materials (already pre-selected from the catalogue):\n${catalogueText(candidates)}\n\nWrite a two-sentence introduction and, for up to three candidates (best first), one sentence on why it suits the brief. Mention that availability, finishes and prices are confirmed by WHITE CARRARA with its suppliers. Write all text in this language: ${language}.`,
          },
        ],
      });
      return r ? { ...r, picks: r.picks.filter((p) => slugs.includes(p.slug)).slice(0, 3) } : null;
    },
  };
}
