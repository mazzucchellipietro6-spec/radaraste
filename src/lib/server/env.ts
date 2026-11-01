// Lettura delle variabili d'ambiente lato server (mai esposte al browser).
// Funziona sia in sviluppo (import.meta.env, file .env) sia in produzione (process.env su Vercel/Netlify/Node).
export function env(name: string): string | undefined {
  const fromProcess = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  const fromVite = (import.meta.env as Record<string, string | undefined>)[name];
  const v = fromProcess ?? fromVite;
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export function envFlag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes((env(name) ?? '').toLowerCase());
}

export const isProd = () => import.meta.env.PROD;
