// Limiti di frequenza. Con il database collegato il conteggio è condiviso tra tutte le istanze
// (funzione SQL public.rate_limit_hit); altrimenti vale per la singola istanza in memoria.
import { asSystem, dbConfigured } from './db';

const memory = new Map<string, { count: number; reset: number }>();

export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (dbConfigured()) {
    try {
      const rows = await asSystem((tx) => tx<{ allowed: boolean }[]>`select public.rate_limit_hit(${key}, ${windowSeconds}, ${max}) as allowed`);
      return rows[0]?.allowed ?? true;
    } catch (err) {
      console.warn('[rate-limit] uso il contatore in memoria:', (err as Error).message);
    }
  }
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.reset < now) {
    memory.set(key, { count: 1, reset: now + windowSeconds * 1000 });
    return true;
  }
  cur.count++;
  if (memory.size > 5000) for (const [k, v] of memory) if (v.reset < now) memory.delete(k);
  return cur.count <= max;
}
