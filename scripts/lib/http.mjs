// Richieste "educate": user-agent riconoscibile, robots.txt rispettato,
// pausa minima tra due richieste allo stesso sito, pochi tentativi con attesa crescente.

export const USER_AGENT = 'RadarAsteItalia/1.0 (+https://github.com/mazzucchellipietro6-spec/radaraste)';

// stato: 'bloccata' (il sito rifiuta), 'vietata' (robots.txt), 'errore' (rete o server); http: codice HTTP se c'è
export class FonteBloccata extends Error {
  constructor(messaggio, stato = 'bloccata', http = null) { super(messaggio); this.stato = stato; this.http = http; }
}

const ultimaRichiesta = new Map(); // host -> timestamp
export const richiestePerHost = new Map(); // host -> numero di richieste fatte (robots.txt compreso)
const robotsCache = new Map();     // host -> regole

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function rispettaPausa(host, intervalloMs) {
  const ultima = ultimaRichiesta.get(host) || 0;
  const attesa = ultima + intervalloMs - Date.now();
  if (attesa > 0) await pausa(attesa);
  ultimaRichiesta.set(host, Date.now());
}

/* ---- robots.txt ---- */

export function analizzaRobots(testo, agente = 'RadarAsteItalia') {
  const gruppi = [];
  let corrente = null;
  for (const grezza of testo.split(/\r?\n/)) {
    const riga = grezza.replace(/#.*/, '').trim();
    const m = riga.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase(), valore = m[2].trim();
    if (campo === 'user-agent') {
      if (!corrente || corrente.regole.length) { corrente = { agenti: [], regole: [] }; gruppi.push(corrente); }
      corrente.agenti.push(valore.toLowerCase());
    } else if ((campo === 'allow' || campo === 'disallow') && corrente) {
      corrente.regole.push({ consenti: campo === 'allow', percorso: valore });
    }
  }
  const a = agente.toLowerCase();
  const specifico = gruppi.find((g) => g.agenti.some((x) => x !== '*' && a.includes(x)));
  const generico = gruppi.find((g) => g.agenti.includes('*'));
  return (specifico || generico || { regole: [] }).regole.filter((r) => r.percorso !== '' || !r.consenti);
}

function corrisponde(percorso, regola) {
  if (regola === '') return false; // "Disallow:" vuoto = nessun divieto
  const re = '^' + regola.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
  return new RegExp(re).test(percorso);
}

export function consentito(regole, percorso) {
  // vince la regola più lunga che corrisponde (come Google); a parità vince Allow
  let migliore = null;
  for (const r of regole) {
    if (!corrisponde(percorso, r.percorso)) continue;
    if (!migliore || r.percorso.length > migliore.percorso.length || (r.percorso.length === migliore.percorso.length && r.consenti)) migliore = r;
  }
  return !migliore || migliore.consenti;
}

// attese prima di riprovare (per tentativo): errore di rete, errore del sito (5xx)
export const ATTESE = { reteMs: 5000, sitoMs: 10000 };

// robots.txt: errori di rete e 5xx si riprovano fino a 3 volte (22/10/2026: un solo UND_ERR_CONNECT_TIMEOUT fermava
// il PVP per tutta la raccolta); se resta in 5xx la fonte si ferma, perché le regole non si conoscono (RFC 9309).
async function regoleRobots(origine, tentativi = 3) {
  if (robotsCache.has(origine)) return robotsCache.get(origine);
  const host = new URL(origine).host;
  for (let i = 1; ; i++) {
    let r;
    try {
      richiestePerHost.set(host, (richiestePerHost.get(host) || 0) + 1);
      r = await fetch(origine + '/robots.txt', { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000) });
      if (r.status === 401 || r.status === 403) throw new FonteBloccata(`robots.txt non accessibile (HTTP ${r.status})`);
      if (r.status < 500) {
        // 404 o simili: nessuna restrizione dichiarata
        const regole = r.ok ? analizzaRobots(await r.text()) : [];
        robotsCache.set(origine, regole);
        return regole;
      }
    } catch (e) {
      if (e instanceof FonteBloccata) throw e;
      if (i >= tentativi) throw new FonteBloccata(`sito non raggiungibile (${e.cause?.code || e.message})`, 'errore');
      await pausa(ATTESE.reteMs * i);
      continue;
    }
    if (i >= tentativi) throw new FonteBloccata(`robots.txt non disponibile (HTTP ${r.status})`, 'errore', r.status);
    await pausa(ATTESE.sitoMs * i);
  }
}

/* ---- richiesta ---- */

export async function richiesta(url, { metodo = 'GET', corpo, intestazioni = {}, intervalloMs = 2500, tentativi = 3, json = false } = {}) {
  const u = new URL(url);
  const regole = await regoleRobots(u.origin);
  if (!consentito(regole, u.pathname + u.search)) throw new FonteBloccata(`robots.txt vieta ${u.pathname}`, 'vietata');

  for (let i = 1; i <= tentativi; i++) {
    await rispettaPausa(u.host, intervalloMs);
    richiestePerHost.set(u.host, (richiestePerHost.get(u.host) || 0) + 1);
    let r;
    try {
      r = await fetch(url, {
        method: metodo,
        body: corpo,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it-IT,it;q=0.9', ...intestazioni },
        signal: AbortSignal.timeout(45000)
      });
    } catch (e) {
      if (i === tentativi) throw new FonteBloccata(`errore di rete (${e.cause?.code || e.message})`, 'errore');
      await pausa(ATTESE.reteMs * i);
      continue;
    }
    if (r.status === 401 || r.status === 403) throw new FonteBloccata(`accesso negato dal sito (HTTP ${r.status})`, 'bloccata', r.status);
    if (r.status === 429) throw new FonteBloccata('il sito chiede di rallentare (HTTP 429): raccolta interrotta', 'bloccata', 429);
    if (r.status >= 500) {
      if (i === tentativi) throw new FonteBloccata(`errore del sito (HTTP ${r.status})`, 'errore');
      await pausa(ATTESE.sitoMs * i);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} su ${url}`);
    return json ? r.json() : r.text();
  }
}
