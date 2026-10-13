import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  normalizzaLotto, normalizzaComune, paroleVia, stessaVia, riga, daRiga, unisciRighe, raggruppa, catena, aggiornaIndice, leggiIndice
} from '../scripts/lib/storico.mjs';

// vendita della ricerca del PVP (solo i campi usati dall'indice)
const vend = (id, data, prezzo, o = {}) => ({
  id, dataVendita: data, prezzoBaseAsta: prezzo, esito: o.esito ?? null, codiceTribunale: o.tribunale ?? 'T1', procedura: o.procedura ?? '120',
  numeroLotto: o.lotto ?? '1', indirizzo: { citta: o.comune ?? 'Genova', via: o.via ?? 'Via Roma 10' }, tipoLotto: o.tipo ?? 'IMMOBILI',
  categoriaLotto: o.categoria ?? 'IMMOBILE_RESIDENZIALE'
});
const v = (...a) => daRiga(riga(vend(...a)));
const OGGI = '2026-10-13';

test('lotti, comuni e vie normalizzati', () => {
  assert.equal(normalizzaLotto('LOTTO 001'), '1');
  assert.equal(normalizzaLotto('Lotto unico'), 'U');
  assert.equal(normalizzaLotto(''), 'U');
  assert.equal(normalizzaLotto('3 bis'), '3BIS');
  assert.equal(normalizzaComune("Cornate d'Adda"), 'cornatedadda');
  assert.deepEqual([...paroleVia('Via delle Rose, 5 - Genova', 'Genova')], ['rose']);
  assert.equal(stessaVia(paroleVia('Via Roma 10'), paroleVia('VIA ROMA SNC')), true);
  assert.equal(stessaVia(paroleVia('Via Roma'), paroleVia('Piazza Dante')), false);
  assert.equal(stessaVia(new Set(), paroleVia('Via Roma')), true);
  assert.equal(stessaVia(new Set(), paroleVia('Via Roma'), true), false);
});

test('riga dell\'indice e ritorno', () => {
  const r = riga(vend(5, '2026-01-10', 1000, { esito: 'ASDES' }));
  assert.deepEqual(r, [5, 'T1', '120', '1', '2026-01-10', 1000, 'ASDES', 'Genova', 'Via Roma 10', 'I', 'IMMOBILE_RESIDENZIALE']);
  assert.equal(daRiga(r).esito, 'ASDES');
  assert.equal(riga({ id: 1 })[5], null); // prezzo mancante
});

test('unione delle righe: per le date coperte valgono le nuove, il resto si conserva', () => {
  const vecchie = [[1, 'T', '1', 'U', '2026-01-01', 1, null], [2, 'T', '1', 'U', '2026-09-01', 1, null], [3, 'T', '1', 'U', '2020-01-01', 1, null]];
  const nuove = [[4, 'T', '1', 'U', '2026-09-02', 1, 'ASDES'], [5, 'T', '1', 'U', '2026-10-20', 1, null]];
  const r = unisciRighe(vecchie, nuove, { copertoDa: '2026-08-01', oggi: OGGI, dal: '2023-10-13' });
  // 2 (coperta e sparita) tolta, 3 troppo vecchia, 5 futura
  assert.deepEqual(r.map((x) => x[0]), [4, 1]);
});

test('catena: tre tentativi con ribassi, deserte e primo prezzo', () => {
  const vendite = [v(1, '2025-06-10', 100000, { esito: 'ASDES' }), v(2, '2025-12-10', 75000, { esito: 'ASDES' }), v(3, '2026-11-20', 56250)];
  const c = catena(vendite[2], raggruppa(vendite), OGGI);
  assert.equal(c.tentativo, 3);
  assert.equal(c.deserte, 2);
  assert.equal(c.primoPrezzo, 100000);
  assert.equal(c.ribasso, 0.25);
  assert.deepEqual(c.storico.map((s) => s.slice(0, 3)), [['2025-06-10', 100000, 'deserta'], ['2025-12-10', 75000, 'deserta']]);
});

test('catena: prima asta e vendita sospesa (non conta come tentativo)', () => {
  const sola = [v(9, '2026-11-20', 50000)];
  assert.equal(catena(sola[0], raggruppa(sola), OGGI).tentativo, 1);
  const vendite = [v(1, '2026-03-01', 80000, { esito: 'SOSPE' }), v(2, '2026-11-20', 80000)];
  const c = catena(vendite[1], raggruppa(vendite), OGGI);
  assert.equal(c.tentativo, 1);
  assert.equal(c.storico.length, 1);
  assert.equal(c.storico[0][2], 'sospesa');
});

test('catena: procedure omonime separate dal comune, ambiguità non collegate', () => {
  // stessa chiave in un altro comune: non è un tentativo precedente
  let vendite = [v(1, '2025-06-10', 100000, { comune: 'Savona', via: 'Via Torino' }), v(2, '2026-11-20', 80000)];
  assert.equal(catena(vendite[1], raggruppa(vendite), OGGI).tentativo, 1);
  // indirizzo diverso nello stesso comune
  vendite = [v(1, '2025-06-10', 100000, { via: 'Piazza Dante 3' }), v(2, '2026-11-20', 80000)];
  assert.deepEqual(catena(vendite[1], raggruppa(vendite), OGGI), { ambigua: true, motivo: 'indirizzo diverso' });
  // prezzo che sale
  vendite = [v(1, '2025-06-10', 50000), v(2, '2026-11-20', 80000)];
  assert.equal(catena(vendite[1], raggruppa(vendite), OGGI).motivo, 'prezzo che sale');
  // due vendite diverse lo stesso giorno
  vendite = [v(1, '2025-06-10', 100000), v(3, '2025-06-10', 30000), v(2, '2026-11-20', 80000)];
  assert.equal(catena(vendite[2], raggruppa(vendite), OGGI).motivo, 'due vendite diverse nello stesso giorno');
  // senza comune né via: tentativo sconosciuto
  const x = v(4, '2026-11-20', 1000, { comune: '', via: '' });
  assert.equal(catena(x, raggruppa([x]), OGGI), null);
});

test('catena: beni mobili di categoria diversa non si collegano, prezzo 0 = dato mancante', () => {
  let vendite = [v(1, '2025-06-10', 9000, { tipo: 'MOBILI', categoria: 'AUTOVEICOLI_E_CICLI' }), v(2, '2026-11-20', 5000, { tipo: 'MOBILI', categoria: 'ARREDAMENTO_ELETTRO' })];
  assert.equal(catena(vendite[1], raggruppa(vendite), OGGI).tentativo, 1);
  vendite = [v(1, '2025-01-10', 100000), v(2, '2025-06-10', 0), v(3, '2026-11-20', 75000)];
  const c = catena(vendite[2], raggruppa(vendite), OGGI);
  assert.equal(c.tentativo, 3);
  assert.equal(c.ribasso, 0.25); // confronto con l'ultimo prezzo valido
});

test('indice: costruzione, aggiornamento incrementale, interruzione, partenza dalla pagina giusta', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'radar-storico-'));
  const file = path.join(dir, 'indice.json');
  try {
    const mk = (id, d, esito = null) => vend(id, d, 1000, { esito });
    const pagine = [[mk(9, '2026-12-01'), mk(8, '2026-10-01')], [mk(7, '2026-09-01'), mk(6, '2025-01-01')], [mk(5, '2023-11-01'), mk(4, '2023-01-01')]];
    const chiamate = [];
    const pagina = async (n) => { chiamate.push(n); return { content: pagine[n] || [], last: n >= pagine.length - 1 }; };
    let r = await aggiornaIndice({ file, oggi: '2026-10-12', pagina, log: () => {} });
    assert.equal(r.indice.completo, true);
    assert.deepEqual(r.indice.righe.map((x) => x[0]), [8, 7, 6, 5]);
    // aggiornamento: si riscarica solo fino a 60 giorni prima dell'ultima data; esito nuovo per la 8, la 7 sparita
    pagine[0][1] = mk(8, '2026-10-01', 'ASDES'); pagine[1] = [mk(6, '2025-01-01')];
    chiamate.length = 0;
    r = await aggiornaIndice({ file, oggi: '2026-10-13', pagina, log: () => {} });
    assert.deepEqual(chiamate, [0, 1]);
    assert.deepEqual(r.indice.righe.map((x) => x[0] + ':' + (x[6] || '-')), ['8:ASDES', '6:-', '5:-']);
    assert.equal((await leggiIndice(file)).righe.length, 3);
    // partenza da una pagina successiva: se non contiene vendite future si riparte da 0
    chiamate.length = 0;
    await aggiornaIndice({ file, oggi: '2026-10-13', pagina, log: () => {}, primaPagina: 1 });
    assert.deepEqual(chiamate, [1, 0, 1]);
    // interruzione su indice assente: si salva il letto, incompleto
    await rm(file, { force: true });
    const rotta = async (n) => { if (n === 1) throw new Error('rete'); return pagina(n); };
    r = await aggiornaIndice({ file, oggi: '2026-10-12', pagina: rotta, log: () => {} });
    assert.equal(r.indice.completo, false);
    assert.equal(r.errore.message, 'rete');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('workflow: indice e schede in cache tra un giorno e l\'altro, indice non pubblicato, schede sì', async () => {
  const { readFile } = await import('node:fs/promises');
  const y = await readFile(new URL('../.github/workflows/aggiorna-aste.yml', import.meta.url), 'utf8');
  assert.match(y, /timeout-minutes:\s*110/);
  const ripristino = y.indexOf('actions/cache/restore@v4'), raccolta = y.indexOf('scripts/raccogli.mjs'), salvataggio = y.indexOf('actions/cache/save@v4');
  assert.ok(ripristino > 0 && raccolta > ripristino && salvataggio > raccolta, 'restore prima della raccolta, save dopo');
  assert.match(y, /restore-keys:\s*\|\s*\n\s*aste-arricchimento-/);
  assert.equal((y.match(/key: aste-arricchimento-\$\{\{ github\.run_id \}\}/g) || []).length, 2);
  for (const p of ['data/storico-indice.json', 'data/dettagli/']) assert.equal(y.split(p).length - 1 >= 2, true, p + ' in restore e save');
  const sito = y.slice(y.indexOf('Prepara il sito'));
  assert.doesNotMatch(sito.split('\n').find((r) => /cp -r \*\.html/.test(r)), /\bdata\b/, 'data/ non copiata per intero');
  assert.match(sito, /! -name 'storico-indice\.json\*'/);
  assert.match(sito, /test ! -e _site\/data\/storico-indice\.json/);
});

test('workflow: OMI dal repository privato (mai pubblicate), Cacciatore e Telegram dopo la raccolta, token solo dai secret', async () => {
  const { readFile } = await import('node:fs/promises');
  const y = await readFile(new URL('../.github/workflows/aggiorna-aste.yml', import.meta.url), 'utf8');
  const raccolta = y.indexOf('scripts/raccogli.mjs'), omi = y.indexOf('scripts/omi.mjs'), cacc = y.indexOf('scripts/cacciatore.mjs'), tg = y.indexOf('scripts/telegram.mjs');
  assert.ok(omi > 0 && omi < raccolta, 'indice OMI prima della raccolta');
  assert.ok(cacc > raccolta && tg > cacc, 'Cacciatore e Telegram dopo la raccolta');
  assert.match(y, /repository: \$\{\{ vars\.OMI_REPO \}\}/);
  assert.match(y, /token: \$\{\{ secrets\.OMI_TOKEN \}\}/);
  assert.match(y, /TELEGRAM_BOT_TOKEN: \$\{\{ secrets\.TELEGRAM_BOT_TOKEN \}\}/);
  const sito = y.slice(y.indexOf('Prepara il sito'));
  assert.match(sito, /! -name 'omi'/);
  assert.match(sito, /test ! -e _site\/data\/omi/);
  assert.match(y, /data\/cacciatore-storico\.json/);
});
