/* Ponte tra il Consulente d'asta e un servizio di intelligenza artificiale (Claude, API di Anthropic). SPENTO finché
 * non viene configurato. È una funzione di Cloudflare Pages (cartella functions/): su GitHub Pages non viene pubblicata.
 *
 * Variabili d'ambiente (Cloudflare → Pages → Impostazioni → Variabili e segreti), MAI nel codice:
 *   ANTHROPIC_API_KEY   chiave dell'API (segreto). Senza, la funzione risponde 503 e il sito usa le regole.
 *   CONSULENTE_MODELLO  modello, es. "claude-sonnet-5-5" (vedi costi in CONSULENTE.md)
 *   ORIGINE             indirizzo del sito autorizzato, es. "https://radaraste.pages.dev"
 *   MAX_TOKEN           lunghezza massima della risposta (predefinito 1200)
 * Poi in config/consulente.js: ponte: '/api/consulente'.
 *
 * Il servizio non riceve i dati delle aste: per ogni numero chiede al browser di usare gli strumenti del sito
 * (consulente_regole, scheda_asta) e risponde con quei risultati. Il browser rimanda tutta la conversazione a ogni
 * giro (la funzione non conserva nulla). */
const SISTEMA = `Sei il Consulente d'asta di Radar Aste Italia. Rispondi in italiano, in modo chiaro e breve.
Regole:
- Ogni numero (prezzi, valori, costi, sconti, rate, probabilità) deve venire da uno strumento: usa consulente_regole con la domanda dell'utente riformulata, o scheda_asta con l'id. Non stimare mai a memoria.
- Riporta la fonte e il livello di affidabilità indicati dagli strumenti. Se un dato manca, dillo.
- Non dare consigli di investimento personalizzati: spiega i numeri e i rischi, ricorda di leggere avviso e perizia e di sentire un professionista.
- Se la domanda non riguarda aste, immobili, veicoli all'asta, costi o mutui, dillo con gentilezza.`;

const STRUMENTI = [
  { name: 'consulente_regole', description: 'Motore del sito: cerca e filtra le aste in corso, spiega un\'asta, calcola costi totali con le imposte, rata del mutuo, rendimento dell\'affitto e risponde sulle regole delle aste. Restituisce blocchi con aste, conti, fonti e affidabilità.',
    input_schema: { type: 'object', properties: { domanda: { type: 'string', description: 'Domanda in italiano, completa di luogo, prezzo, tipo e altri dettagli utili' } }, required: ['domanda'] } },
  { name: 'scheda_asta', description: 'Dati completi di una singola asta del sito (prezzi, date, valore di mercato con fonte e affidabilità, costi, rischi, punteggio).',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Identificativo, es. pvp-4644196' } }, required: ['id'] } }
];

function risposta(stato, corpo, origine) {
  return new Response(JSON.stringify(corpo), { status: stato, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': origine || 'null', 'Cache-Control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  const origine = request.headers.get('Origin') || '';
  if (!env.ANTHROPIC_API_KEY) return risposta(503, { errore: 'Modalità AI non configurata' }, origine);
  if (env.ORIGINE && origine !== env.ORIGINE) return risposta(403, { errore: 'Origine non autorizzata' }, '');
  let dati;
  try { dati = await request.json(); } catch { return risposta(400, { errore: 'Richiesta non valida' }, origine); }
  const messaggi = Array.isArray(dati.messaggi) ? dati.messaggi.slice(-24) : [];
  if (!messaggi.length || JSON.stringify(messaggi).length > 200000) return risposta(400, { errore: 'Conversazione vuota o troppo lunga' }, origine);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.CONSULENTE_MODELLO || 'claude-sonnet-5-5', max_tokens: Number(env.MAX_TOKEN) || 1200, system: SISTEMA, tools: STRUMENTI, messages: messaggi })
  });
  const j = await r.json().catch(() => ({}));
  // mai restituire la chiave o i dettagli interni dell'errore
  if (!r.ok) return risposta(502, { errore: 'Il servizio AI non ha risposto (' + r.status + ')' }, origine);
  return risposta(200, { contenuto: j.content || [], stop: j.stop_reason || null, uso: j.usage || null }, origine);
}
