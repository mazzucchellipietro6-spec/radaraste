// Elenco di tutti i testi traducibili (interfaccia + contenuti) con il testo italiano di partenza.
import { getCollection } from 'astro:content';
import { collectEntry, flatten, SPECS } from '~/i18n/core.mjs';
import itUi from '~/i18n/locales/ui/it.json';

export interface Message {
  key: string;
  src: string;
  kind: 'ui' | 'content';
}

let cache: Message[] | null = null;
export async function allMessages(): Promise<Message[]> {
  if (cache) return cache;
  const out: Message[] = Object.entries(flatten(itUi)).map(([key, src]) => ({ key, src: String(src), kind: 'ui' as const }));
  for (const col of Object.keys(SPECS) as (keyof typeof SPECS)[]) {
    const entries = await getCollection(col as never).catch(() => []);
    for (const e of entries as { id: string; data: Record<string, unknown> }[]) {
      for (const m of collectEntry(col, e.id, e.data)) out.push({ key: m.key, src: m.text, kind: 'content' });
    }
  }
  cache = out;
  return out;
}
