// Indirizzo pubblico del sito, per i link nelle email e nei pagamenti.
export const siteUrl = () => (import.meta.env.SITE ?? 'http://localhost:4321').replace(/\/$/, '');
