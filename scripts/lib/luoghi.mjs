// Riconosce la provincia (sigla) da nomi scritti in modi diversi, usando data/geo.js.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const GEO = require('../../data/geo.js');

const chiave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^(provincia|citta metropolitana|libero consorzio comunale) d[ie'\s]+\s*/, '').replace(/[^a-z]/g, '');

const ALIAS = {
  monzaedellabrianza: 'MB', monzaebrianza: 'MB', reggionellemilia: 'RE', reggioemilia: 'RE', reggiodicalabria: 'RC',
  bolzanobozen: 'BZ', bozen: 'BZ', valledaosta: 'AO', valledaostavalleedaoste: 'AO', aostaaoste: 'AO',
  massacarrara: 'MS', massa: 'MS', forlicesena: 'FC', forli: 'FC', pesaroeurbino: 'PU', pesarourbino: 'PU', pesaro: 'PU',
  barlettaandriatrani: 'BT', barletta: 'BT', andria: 'BT', trani: 'BT', verbanocusioossola: 'VB', verbania: 'VB',
  sudsardegna: 'SU', carboniaiglesias: 'SU', mediocampidano: 'SU', sulcisiglesiente: 'SU', carbonia: 'SU',
  olbiatempio: 'SS', galluranordestsardegna: 'SS', nordestsardegna: 'SS', ogliastra: 'NU', roma: 'RM', romacapitale: 'RM'
};

// Sedi di tribunale che non sono capoluogo di provincia → provincia in cui si trovano.
const TRIBUNALI = {
  ivrea: 'TO', bustoarsizio: 'VA', monza: 'MB', rovereto: 'TN', urbino: 'PU', spoleto: 'PG',
  tivoli: 'RM', velletri: 'RM', civitavecchia: 'RM', cassino: 'FR',
  sulmona: 'AQ', avezzano: 'AQ', lanciano: 'CH', vasto: 'CH', larino: 'CB',
  napolinord: 'CE', napolinordinaversa: 'CE', aversa: 'CE', santamariacapuavetere: 'CE', nola: 'NA', torreannunziata: 'NA',
  nocerainferiore: 'SA', vallodellalucania: 'SA', lagonegro: 'PZ', melfi: 'PZ',
  castrovillari: 'CS', paola: 'CS', lameziaterme: 'CZ', locri: 'RC', palmi: 'RC',
  terminiimerese: 'PA', sciacca: 'AG', marsala: 'TP', gela: 'CL', caltagirone: 'CT',
  barcellonapozzodigotto: 'ME', patti: 'ME', lanusei: 'NU', tempiopausania: 'SS'
};

const PER_NOME = {};
for (const p of Object.values(GEO.province)) PER_NOME[chiave(p.nome)] = p.sigla;

export function provincia(nome) {
  if (!nome) return null;
  const t = String(nome).trim();
  if (/^[A-Za-z]{2}$/.test(t) && GEO.province[t.toUpperCase()]) return GEO.province[t.toUpperCase()];
  const k = chiave(t.split(/\s+ex\s+/i)[0]); // "Potenza Ex Tribunale di Melfi" → Potenza
  const sigla = PER_NOME[k] || ALIAS[k] || TRIBUNALI[k];
  return sigla ? GEO.province[sigla] : null;
}

const MINUSCOLE = new Set(['di', 'del', 'della', 'delle', 'dei', 'degli', 'in', 'e', 'al', 'sul', 'sulla', 'a', 'da', 'nel', 'nell']);
export const titolo = (s) => String(s || '').toLowerCase()
  .replace(/(^|[\s'’(-])([a-zà-ÿ]+)/g, (m, a, w, i) => a + (i > 0 && MINUSCOLE.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
