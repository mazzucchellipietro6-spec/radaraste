#!/usr/bin/env node
/* Ricalcola valore di mercato, sconto e punteggio di tutte le aste GIÀ raccolte, senza nessuna richiesta in rete.
 * Serve dopo aver aggiornato le quotazioni OMI (scripts/omi.mjs) o cambiato le regole in js/punteggio.js / js/omi.js:
 *
 *   node scripts/omi.mjs            # ricostruisce data/omi/indice.json dai file in data/omi/grezzi/
 *   node scripts/ricalcola.mjs      # riscrive data/aste.js, data/riepilogo.js e data/dettagli/ con i nuovi valori
 *   node scripts/cacciatore.mjs     # rifà la scelta degli affari di oggi
 *
 * Legge data/aste.js e le schede a pezzi (descrizioni complete per l'OMI); i dati raccolti restano quelli. */
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { valutaTutte, leggiSchede, scriviSchede, record, DAL_PUNTEGGIO, LUNGHI } from './lib/arricchimento.mjs';
import { fileCollegati } from './lib/correzioni.mjs';
import { statoAgenti, scriviCombinazioni } from './lib/derivati.mjs';
import { CAMPI } from './raccogli.mjs';

const require = createRequire(import.meta.url);
const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Formato = require('../js/formato.js');
const Riepilogo = require('../js/riepilogo.js');
const T = require('../config/tariffe.js');

async function scriviAtomico(file, testo) { await writeFile(file + '.tmp', testo); await rename(file + '.tmp', file); }

async function main() {
  const file = path.resolve(RADICE, process.argv[2] || 'data/aste.js');
  const collegati = fileCollegati(file);
  const t = await readFile(file, 'utf8');
  const dati = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  const aste = Formato.decodifica(dati);
  const schede = await leggiSchede(collegati.dettagli);
  let indiceOmi = null;
  try { indiceOmi = JSON.parse(await readFile(path.resolve(RADICE, 'data/omi/indice.json'), 'utf8')); } catch { indiceOmi = null; }
  console.log(`${aste.length} aste, ${schede.size} schede a pezzi, quotazioni OMI ${indiceOmi ? indiceOmi.semestre : 'non disponibili'}`);
  const avvio = Date.now();
  const { dettagli } = valutaTutte(aste, T, { omi: indiceOmi, testi: (a) => (schede.get(a.id) && schede.get(a.id).descrizione) || a.descrizione || a.titolo });
  const conta = (f) => { const o = {}; for (const a of aste) { const k = f(a); if (k != null) o[k] = (o[k] || 0) + 1; } return o; };
  const conOmi = aste.filter((a) => a.omiMin).length;
  dati.punteggio = {
    conValore: aste.filter((a) => a.valore != null).length, perFonte: conta((a) => a.fonteValore), perAffidabilita: conta((a) => a.affidabilita),
    conPunteggio: aste.filter((a) => a.punteggio != null).length, completi: aste.filter((a) => a.punteggioCompleto).length,
    omi: indiceOmi ? { semestre: indiceOmi.semestre, conValore: conOmi, fonte: indiceOmi.fonte, licenza: indiceOmi.licenza } : null,
    ricalcolato: new Date().toISOString()
  };
  console.log('  per fonte del valore:', JSON.stringify(dati.punteggio.perFonte));
  console.log('  per affidabilità:', JSON.stringify(dati.punteggio.perAffidabilita));
  // schede: dati lunghi della raccolta + nuovi campi corti e nuovo dettaglio del punteggio
  if (schede.size) {
    const records = new Map(aste.map((a) => {
      const vecchia = schede.get(a.id) || {};
      const lunghi = { ...vecchia };
      // i campi corti si riscrivono dall'elenco; quelli lunghi (descrizione completa, foto, allegati…) restano quelli della scheda
      for (const c of CAMPI) if (!LUNGHI.includes(c)) delete lunghi[c];
      for (const k of DAL_PUNTEGGIO) delete lunghi[k];
      delete lunghi.affitto;
      const r = record(a, CAMPI, lunghi, dettagli.get(a.id));
      if (dettagli.get(a.id) && dettagli.get(a.id).affitto) r.affitto = dettagli.get(a.id).affitto;
      return [a.id, r];
    }));
    const p = await scriviSchede(collegati.dettagli, records);
    console.log(`  ✓ ${records.size} schede riscritte in ${p.file} pezzi`);
  }
  const nuovi = { ...dati, ...Formato.codifica(aste, CAMPI) };
  const intestazione = t.slice(0, t.indexOf('window.ASTE_RACCOLTE'));
  await scriviAtomico(file, intestazione + 'window.ASTE_RACCOLTE = ' + JSON.stringify(nuovi) + ';\n');
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const riepilogo = { aggiornato: dati.aggiornato, fonti: (dati.fonti || []).map((f) => ({ nome: f.nome, stato: f.stato })), ...Riepilogo.calcola(aste, oggi), agenti: statoAgenti(aste, nuovi) };
  await scriviAtomico(collegati.riepilogo, '/* Riepilogo per la home, generato da scripts/ricalcola.mjs il ' + new Date().toISOString() + '. */\nwindow.RIEPILOGO = ' + JSON.stringify(riepilogo) + ';\n');
  const c = await scriviCombinazioni(path.join(path.dirname(file), 'combinazioni.js'), aste, T, oggi);
  console.log(`  combinazioni d'oro: ${c.trovate} su ${c.gruppiAnalizzati} procedure con più lotti`);
  console.log(`✓ ricalcolate ${dati.punteggio.conPunteggio} aste con punteggio (${dati.punteggio.completi} complete) in ${Date.now() - avvio} ms`);
}

main().catch((e) => { console.error(e); process.exit(1); });
