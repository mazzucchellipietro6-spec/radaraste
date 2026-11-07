// Provider di intelligenza artificiale configurabile (variabile AI_PROVIDER).
//   anthropic -> Claude (Anthropic), predefinito se è presente ANTHROPIC_API_KEY
//   none      -> nessuna AI: il sito usa solo l'analisi automatica di colori e venature nel browser
// Per aggiungere un altro fornitore basta creare un file accanto a anthropic.ts che implementi AiProvider.
import { env } from '../env';
import { anthropicProvider } from './anthropic';

export interface CatalogueHint {
  slug: string;
  name: string;
  category: string;
  baseColor: string[];
  veinColor: string[];
  veinIntensity: string;
  veinPattern: string;
  visualNotes: string;
}

export interface MarbleAnalysis {
  isStone: boolean;
  analysis: { background: string; veins: string; pattern: string; notes: string };
  matches: { slug: string; similarity: 'high' | 'medium' | 'low'; reasons: string }[];
  caveat: string;
}

export interface ConciergeAdvice {
  intro: string;
  picks: { slug: string; why: string }[];
}

export interface AiProvider {
  name: string;
  analyzeMarble(input: { image: Buffer; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; language: string; catalogue: CatalogueHint[] }): Promise<MarbleAnalysis | null>;
  conciergeAdvice(input: { language: string; brief: Record<string, string | string[]>; candidates: CatalogueHint[] }): Promise<ConciergeAdvice | null>;
}

export function aiProvider(): AiProvider | null {
  const choice = (env('AI_PROVIDER') ?? (env('ANTHROPIC_API_KEY') ? 'anthropic' : 'none')).toLowerCase();
  if (choice === 'anthropic' && env('ANTHROPIC_API_KEY')) return anthropicProvider();
  return null;
}
