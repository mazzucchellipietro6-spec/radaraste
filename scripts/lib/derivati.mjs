/* Dati derivati scritti dopo ogni raccolta (scripts/raccogli.mjs) e dopo ogni ricalcolo (scripts/ricalcola.mjs):
 *  - stato degli assistenti per la home e le loro pagine (dentro data/riepilogo.js, campo "agenti");
 *  - data/combinazioni.js: le "Combinazioni d'oro" (js/combinazioni.js).
 * Solo conteggi e risultati calcolati dai dati raccolti: nessun valore inventato. */
import { writeFile, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Combinazioni = require('../../js/combinazioni.js');

const conta = (lista, f) => lista.reduce((n, a) => n + (f(a) ? 1 : 0), 0);

/* Cosa ha fatto oggi l'agente di arricchimento (e con quali risultati sul valore di mercato). */
export function statoAgenti(aste, dati) {
  const imm = aste.filter((a) => a.categoria === 'immobile');
  const ar = dati.arricchimento || {};
  return {
    arricchimento: {
      aste: aste.length,
      dettagliLettiOggi: ar.dettagliLettiOggi ?? null,
      conDettaglio: ar.conDettaglio ?? conta(aste, (a) => a.dettaglio),
      conStorico: ar.conStorico ?? conta(aste, (a) => a.tentativo),
      catene: ar.catene ?? null, ambigue: ar.ambigue ?? null,
      conFoto: conta(aste, (a) => Number(a.nFoto) > 0),
      conStima: conta(aste, (a) => Number(a.stima) > 0),
      conTermine: conta(aste, (a) => a.termineOfferte),
      immobili: imm.length,
      conSuperficie: conta(imm, (a) => Number(a.superficieMq) > 0),
      conRischiControllati: conta(aste, (a) => Array.isArray(a.rischi)),
      conRischi: conta(aste, (a) => Array.isArray(a.rischi) && a.rischi.length),
      conOccupazione: conta(imm, (a) => a.stato === 'libero' || a.stato === 'occupato'),
      ribassate: conta(aste, (a) => a.dataRibasso),
      indice: ar.indice || null
    },
    valori: dati.punteggio || null,
    correzioni: dati.correzioni || null,
    fonti: (dati.fonti || []).map((f) => ({ nome: f.nome, stato: f.stato, aste: f.aste ?? null, ultimaRaccolta: f.ultimaRaccolta || null }))
  };
}

export async function scriviCombinazioni(file, aste, T, oggi) {
  const r = Combinazioni.trova(aste, { T, oggi });
  const dati = { aggiornato: new Date().toISOString(), ...r };
  await writeFile(file + '.tmp', '/* Combinazioni d\'oro: lotti della stessa procedura che insieme valgono di più, calcolate da js/combinazioni.js il ' +
    dati.aggiornato + '. */\nwindow.COMBINAZIONI = ' + JSON.stringify(dati) + ';\n');
  await rename(file + '.tmp', file);
  return r;
}
