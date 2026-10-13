import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  statisticheAggiudicazione, scriviStatistiche, leggiStatistiche, gruppoCategoria, fascia, proporzioni, buchi, MARGINE_GIORNI
} from '../scripts/lib/statistiche.mjs';
import { CAMPI_INDICE } from '../scripts/lib/storico.mjs';

const OGGI = '2026-10-13';   // limite: vendite prima del 28/09/2026
let ID = 1;
// riga dell'indice: [id, tribunale, procedura, lotto, data, prezzo, esito, comune, via, tipo, categoria]
const r = (procedura, data, prezzo, esito = null, o = {}) => [o.id ?? ID++, o.tribunale ?? 'T1', String(procedura), o.lotto ?? '1', data, prezzo, esito,
  o.comune ?? 'Genova', o.via ?? 'Via Roma 10', o.tipo ?? 'I', o.categoria ?? 'IMMOBILE_RESIDENZIALE'];
const indice = (righe) => ({ versione: 1, aggiornato: '2026-10-13T05:00:00Z', completo: true, dal: '2025-10-13', al: '2026-10-12', fonte: 'https://pvp.example/ricerca', campi: CAMPI_INDICE, righe });
const solo = (s, k) => ({ aggiudicate: s.aggiudicate, deserte: s.deserte, ignote: s.ignote, n: s.n });

// beni: 40 lotti singoli con esito noto (10 aggiudicati) e 10 senza esito → p calcolabile
function beniNoti() {
  const l = [];
  for (let i = 0; i < 50; i++) l.push(r(900 + i, '2026-06-15', 1000, i < 10 ? 'AGGIU' : i < 40 ? 'ASDES' : null, { tipo: 'M', categoria: 'ARREDAMENTO_ELETTRO', comune: 'Comune' + i }));
  return l;
}

test('gruppi delle categorie del PVP e fasce dei tentativi', () => {
  assert.equal(gruppoCategoria('IMMOBILE_RESIDENZIALE', 'I'), 'residenziale');
  assert.equal(gruppoCategoria('IMMOBILE_COMMERCIALE', 'I'), 'altri-immobili');
  assert.equal(gruppoCategoria('IMMOBILE_INDUSTRIALE', 'I'), 'altri-immobili');
  assert.equal(gruppoCategoria('ALTRA_CATEGORIA', 'I'), 'altri-immobili');   // terreni e simili: sono immobili
  assert.equal(gruppoCategoria('AUTOVEICOLI_E_CICLI', 'M'), 'veicoli');
  assert.equal(gruppoCategoria('NAUTICA', 'M'), 'veicoli');
  assert.equal(gruppoCategoria('ARREDAMENTO_ELETTRO', 'M'), 'beni');
  assert.equal(gruppoCategoria('QUOTA_SOCIETARIA', 'A'), 'beni');
  assert.deepEqual([1, 2, 3, 4, 7].map(fascia), ['1', '2', '3', '4+', '4+']);
});

test('proporzioni: p solo con almeno 30 esiti noti, pMin e pMax contano le ignote', () => {
  assert.deepEqual(proporzioni({ aggiudicate: 10, deserte: 30, ignote: 10 }), { aggiudicate: 10, deserte: 30, ignote: 10, n: 50, p: 0.25, pMin: 0.2, pMax: 0.4 });
  const piccolo = proporzioni({ aggiudicate: 1, deserte: 2, ignote: 0 });
  assert.equal(piccolo.p, null);
  assert.equal(piccolo.pMin, 0.333);   // arrotondato a 3 decimali
  assert.equal(piccolo.pMax, 0.333);
  assert.deepEqual(proporzioni({ aggiudicate: 0, deserte: 0, ignote: 0 }), { aggiudicate: 0, deserte: 0, ignote: 0, n: 0, p: null, pMin: null, pMax: null });
});

test('esiti: aggiudicata, deserta, senza esito ma ritentata = deserta, senza esito e senza seguito = ignota', () => {
  const s = statisticheAggiudicazione(indice([
    // lotto A: deserta, poi senza esito ma ritentato (= deserta), poi aggiudicata
    r(10, '2026-01-10', 100000, 'ASDES'), r(10, '2026-04-10', 75000), r(10, '2026-07-10', 56250, 'AGGIU'),
    // lotto B: senza esito e nessun tentativo successivo → ignota
    r(11, '2026-05-10', 80000)
  ]), { oggi: OGGI });
  const res = s.gruppi.residenziale;
  assert.deepEqual(solo(res), { aggiudicate: 1, deserte: 2, ignote: 1, n: 4 });
  assert.deepEqual(solo(res.tentativi['1']), { aggiudicate: 0, deserte: 1, ignote: 1, n: 2 });
  assert.deepEqual(solo(res.tentativi['2']), { aggiudicate: 0, deserte: 1, ignote: 0, n: 1 });
  assert.deepEqual(solo(res.tentativi['3']), { aggiudicate: 1, deserte: 0, ignote: 0, n: 1 });
  assert.equal(res.p, null);              // 3 esiti noti: troppo pochi
  assert.equal(res.pMin, 0.25);
  assert.equal(res.pMax, 0.5);
  assert.deepEqual(solo(s.totale), solo(res));
});

test('sospese escluse e non contate come tentativo; vendite recenti escluse ma valgono come tentativo successivo', () => {
  const s = statisticheAggiudicazione(indice([
    r(12, '2026-03-01', 90000, 'SOSPE'), r(12, '2026-06-01', 90000), r(12, '2026-09-01', 67500, 'ASDES'),
    // lotto con un nuovo tentativo negli ultimi 15 giorni: quello vecchio senza esito è deserto, quello recente non conta
    r(13, '2026-06-02', 50000, null, { via: 'Via Torino 3' }), r(13, '2026-10-05', 40000, 'AGGIU', { via: 'Via Torino 3' })
  ]), { oggi: OGGI });
  const res = s.gruppi.residenziale;
  assert.deepEqual(solo(res), { aggiudicate: 0, deserte: 3, ignote: 0, n: 3 });
  // la vendita del 01/06 è il 1° tentativo (la sospesa non conta), quella del 01/09 il 2°
  assert.equal(res.tentativi['1'].deserte, 2);
  assert.equal(res.tentativi['2'].deserte, 1);
  assert.equal(s.esclusi.sospese, 1);
  assert.equal(s.esclusi.recenti, 1);
  assert.equal(s.limite, '2026-09-28');
  assert.equal(MARGINE_GIORNI, 15);
});

test('fascia 4+, gruppi diversi, vendite senza catena solo nel totale, doppioni contati una volta', () => {
  const s = statisticheAggiudicazione(indice([
    // cinque tentativi deserti dello stesso lotto (ribassi del 20%)
    r(14, '2025-12-01', 100000, 'ASDES'), r(14, '2026-02-01', 80000, 'ASDES'), r(14, '2026-04-01', 64000, 'ASDES'),
    r(14, '2026-06-01', 51200, 'ASDES'), r(14, '2026-08-01', 40960, 'ASDES'),
    r(20, '2026-05-05', 300000, 'AGGIU', { categoria: 'IMMOBILE_COMMERCIALE' }),
    r(21, '2026-05-05', 9000, 'ASDES', { tipo: 'M', categoria: 'AUTOVEICOLI_E_CICLI' }),
    r(22, '2026-05-05', 40000, 'AGGIU', { tipo: 'M', categoria: 'NAUTICA' }),
    // senza comune né indirizzo: la catena non si ricostruisce
    r(23, '2026-05-05', 500, null, { tipo: 'M', categoria: 'ARREDAMENTO_ELETTRO', comune: '', via: '' }),
    // la stessa vendita pubblicata due volte (una sola con l'esito)
    r(24, '2026-05-06', 70000, null), r(24, '2026-05-06', 70000, 'AGGIU')
  ]), { oggi: OGGI });
  const res = s.gruppi.residenziale;
  assert.equal(res.tentativi['4+'].deserte, 2);
  assert.equal(res.tentativi['3'].deserte, 1);
  assert.deepEqual(solo(res), { aggiudicate: 1, deserte: 5, ignote: 0, n: 6 });
  assert.equal(s.esclusi.doppioni, 1);
  assert.equal(s.gruppi['altri-immobili'].aggiudicate, 1);
  assert.deepEqual(solo(s.gruppi.veicoli), { aggiudicate: 1, deserte: 1, ignote: 0, n: 2 });
  const beni = s.gruppi.beni;
  assert.deepEqual(solo(beni), { aggiudicate: 0, deserte: 0, ignote: 1, n: 1 });
  assert.equal(beni.tentativi['1'].n, 0);   // senza catena: niente fascia
  assert.equal(s.senzaTentativo, 1);
  assert.equal(s.totale.n, 10);
});

test('gruppo con almeno 30 esiti noti: p calcolata, forchetta e testi con la fonte', () => {
  const s = statisticheAggiudicazione(indice(beniNoti()), { oggi: OGGI });
  const b = s.gruppi.beni;
  assert.deepEqual({ p: b.p, pMin: b.pMin, pMax: b.pMax, n: b.n }, { p: 0.25, pMin: 0.2, pMax: 0.4, n: 50 });
  assert.equal(b.tentativi['1'].p, 0.25);
  assert.equal(s.gruppi.residenziale.p, null);
  assert.equal(s.fonte, 'Portale delle Vendite Pubbliche – esiti delle vendite dal 13/10/2025 al 15/06/2026');
  assert.deepEqual(s.periodo, { dal: '2025-10-13', al: '2026-06-15' });
  assert.match(s.metodo, /almeno 30/);
  assert.match(s.metodo, /parte dal 13\/10\/2025/);   // censura a sinistra dichiarata
  assert.ok(s.avvertenze.some((a) => /prezzo di aggiudicazione non è pubblicato/.test(a)));
  // le vendite del 15/06 sono fuori dalle ultime 4 settimane prima del margine
  assert.equal(s.recenti.totale.n, 0);
});

test('blocco recenti e avvertenza quando le aggiudicazioni registrate calano con l\'età', () => {
  const righe = [];
  // vecchie: 60 esiti noti, nessuna aggiudicata; recenti (settembre): 40 esiti noti, 12 aggiudicate
  for (let i = 0; i < 60; i++) righe.push(r(1000 + i, '2026-05-20', 1000, 'ASDES', { comune: 'C' + i }));
  for (let i = 0; i < 40; i++) righe.push(r(2000 + i, '2026-09-15', 1000, i < 12 ? 'AGGIU' : 'ASDES', { comune: 'C' + i }));
  const s = statisticheAggiudicazione(indice(righe), { oggi: OGGI });
  assert.equal(s.recenti.totale.p, 0.3);
  assert.equal(s.totale.p, 0.12);
  assert.equal(s.recenti.giorni, 28);
  assert.deepEqual(s.recenti.periodo, { dal: '2026-09-15', al: '2026-09-15' });
  assert.ok(s.avvertenze.some((a) => /calano con l'età/.test(a)), s.avvertenze.join('\n'));
  assert.deepEqual(s.perMese['2026-09'], [12, 28, 0, 0]);
});

test('buchi dell\'indice: mesi quasi vuoti dichiarati', () => {
  const date = [];
  const mesi = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06', '2024-07'];
  mesi.forEach((m, i) => { const n = i === 3 || i === 4 ? 2 : 100; for (let k = 0; k < n; k++) date.push(m + '-10'); });
  assert.deepEqual(buchi(date, '2023-12-20', '2024-08-05'), [{ dal: '2024-04', al: '2024-05', vendite: 4 }]);
  assert.deepEqual(buchi(date, '2024-01-01', '2024-02-01'), []);
});

test('scriviStatistiche: file window.STATISTICHE scritto in modo atomico; null se manca l\'indice', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'statistiche-'));
  try {
    const fileIndice = path.join(dir, 'storico-indice.json');
    await writeFile(fileIndice, JSON.stringify(indice(beniNoti())));
    const uscita = path.join(dir, 'out', 'statistiche.js');
    const s = await scriviStatistiche(fileIndice, uscita, OGGI);
    assert.equal(s.gruppi.beni.p, 0.25);
    const testo = await readFile(uscita, 'utf8');
    assert.match(testo, /^\/\* STATISTICHE DI AGGIUDICAZIONE/);
    assert.match(testo, /window\.STATISTICHE = \{/);
    global.window = {};
    new Function('window', testo)(global.window);
    assert.equal(global.window.STATISTICHE.gruppi.beni.p, 0.25);
    delete global.window;
    assert.deepEqual((await leggiStatistiche(uscita)).totale, s.totale);
    assert.deepEqual(await readdir(path.join(dir, 'out')), ['statistiche.js']);   // nessun .tmp rimasto
    assert.equal(await scriviStatistiche(path.join(dir, 'manca.json'), uscita, OGGI), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('prestazioni: 150.000 vendite in pochi secondi', () => {
  const righe = [];
  for (let i = 0; i < 50000; i++) {
    const p = String(i), c = 'Comune' + (i % 500);
    righe.push(r(p, '2025-11-10', 100000, 'ASDES', { comune: c }), r(p, '2026-03-10', 75000, null, { comune: c }), r(p, '2026-07-10', 56250, i % 4 ? null : 'AGGIU', { comune: c }));
  }
  const inizio = Date.now();
  const s = statisticheAggiudicazione(indice(righe), { oggi: OGGI });
  const ms = Date.now() - inizio;
  assert.equal(s.totale.n, 150000);
  assert.equal(s.gruppi.residenziale.tentativi['3'].aggiudicate, 12500);
  assert.ok(ms < 5000, ms + ' ms');
});
