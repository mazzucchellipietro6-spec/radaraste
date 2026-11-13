// Radar 3D (js/radar3d-dati.js): aste per i livelli 3D, su un campione reale di 200 aste di data/aste.js
// (tests/fixture/radar3d-campione.json, raccolta del 29/10/2026, campi usati dal radar senza modifiche).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/radar3d-dati.js');
const Calore = require('../js/calore.js');
const Formato = require('../js/formato.js');
const GEO = require('../data/geo.js');

const RADICE = path.join(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(RADICE, f), 'utf8');
const CAMPIONE = JSON.parse(leggi('tests/fixture/radar3d-campione.json'));
const ASTE = CAMPIONE.aste;
const OGGI = CAMPIONE.oggi;
const AFFIDABILE = { media: 1, alta: 1 };
const copia = (a, extra) => Object.assign({}, a, extra);

// conPosizione della mappa 2D (js/pages/mappa.js), eseguita da sola: il radar deve usare gli stessi controlli
function conPosizioneMappa() {
  const src = leggi('js/pages/mappa.js');
  const dentro = src.match(/var DENTRO = (\{[^}]+\});/)[1];
  const f = src.match(/\n  function conPosizione\(a\) \{[\s\S]*?\n  \}\n/)[0];
  return new Function('G', 'var DENTRO = ' + dentro + ';' + f + 'return conPosizione;')(GEO);
}

test('campione: 200 aste reali di data/aste.js, ognuna con titolo e link all\'avviso, di più fonti, mesi e affidabilità', () => {
  assert.equal(CAMPIONE.fonte, 'data/aste.js');
  assert.match(CAMPIONE.raccolta, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(ASTE.length, 200);
  assert.equal(new Set(ASTE.map((a) => a.id)).size, 200);
  for (const a of ASTE) {
    assert.ok(a.titolo, a.id);
    assert.match(a.linkAvviso, /^https:\/\//, a.id);
  }
  const fonti = new Set(ASTE.map((a) => a.fonte)), aff = new Set(ASTE.map((a) => a.affidabilita || 'nessuna'));
  assert.ok(fonti.has('Portale Vendite Pubbliche') && fonti.has('Agenzia del Demanio'));
  for (const k of ['alta', 'media', 'bassa', 'nessuna']) assert.ok(aff.has(k), 'affidabilità ' + k);
  assert.ok(ASTE.some((a) => typeof a.lat !== 'number'), 'anche aste senza coordinate');
  assert.ok(new Set(ASTE.map((a) => String(a.dataAsta).slice(0, 7))).size >= 6, 'più mesi');
});

test('posizione: stessi controlli della mappa 2D (dentro l\'Italia, non lontana dal capoluogo della provincia)', () => {
  const mappa = conPosizioneMappa();
  // casi veri e gli stessi spostati: fuori dall'Italia, lontani dalla provincia, coordinate in testo
  const casi = [];
  for (const a of ASTE) {
    casi.push(a);
    if (typeof a.lat === 'number') {
      casi.push(copia(a, { lat: a.lat + 2 }), copia(a, { lng: a.lng - 2.5 }), copia(a, { lat: 34.9 }), copia(a, { lat: String(a.lat) }));
      casi.push(copia(a, { provincia: undefined, lat: a.lat + 2 }));
    }
  }
  for (const a of casi) assert.equal(R.conPosizione(a, GEO.province), mappa(copia(a)), a.id + ' ' + a.lat + ',' + a.lng);
  assert.ok(casi.filter((a) => R.conPosizione(a)).length > 150, 'la maggior parte dei casi veri ha posizione');
  assert.equal(R.conPosizione(null), false);
});

test('prepara: fuori le aste passate e senza posizione, contate nei totali; ogni punto è un\'asta vera', () => {
  for (const oggi of [OGGI, '2026-11-15', '2027-01-01']) {
    const D = R.prepara(ASTE, { oggi, province: GEO.province });
    const T = D.totali;
    const passate = ASTE.filter((a) => a.dataAsta && a.dataAsta.slice(0, 10) < oggi);
    const inCorso = ASTE.filter((a) => !passate.includes(a));
    const conPos = inCorso.filter((a) => R.conPosizione(a, GEO.province));
    assert.equal(T.aste, 200);
    assert.equal(T.passate, passate.length, oggi);
    assert.equal(T.inCorso, inCorso.length);
    assert.equal(T.conPosizione, conPos.length);
    assert.equal(T.senzaPosizione, inCorso.length - conPos.length);
    assert.equal(D.punti.length, conPos.length);
    assert.deepEqual(D.punti.map((p) => p.id), conPos.map((a) => a.id));
    for (const p of D.punti) {
      assert.ok(!(p.giorno && p.giorno < oggi), 'nessuna asta passata: ' + p.id);
      assert.equal(p.lat, p.a.lat); assert.equal(p.lng, p.a.lng);
      assert.equal(p.affidabile, p.a.sconto != null && !!AFFIDABILE[p.a.affidabilita], p.id);
    }
    assert.equal(T.affidabili, D.punti.filter((p) => p.affidabile).length);
    if (oggi !== OGGI) assert.ok(T.passate > 0, 'con ' + oggi + ' alcune aste del campione sono passate');
  }
  // il campione è del giorno della raccolta: nessuna passata, quasi tutte con posizione
  const D = R.prepara(ASTE, { oggi: OGGI });
  assert.equal(D.totali.passate, 0);
  assert.ok(D.totali.senzaPosizione >= 15);
  assert.ok(D.totali.affidabili >= 60);
});

test('altezza = sconto reale solo con valore affidabile; le altre sono punti bassi grigi', () => {
  const D = R.prepara(ASTE, { oggi: OGGI });
  let negative = 0;
  for (const p of D.punti) {
    const a = p.a;
    if (a.sconto != null && AFFIDABILE[a.affidabilita]) {
      assert.equal(p.sconto, a.sconto);
      assert.equal(p.alto, Math.max(R.ALTO_MIN, Math.min(1, Math.max(0, a.sconto))), p.id);
      if (a.sconto < 0) { negative++; assert.equal(p.alto, R.ALTO_MIN, 'costo oltre il valore: colonna minima'); }
    } else {
      assert.equal(p.sconto, null, p.id);
      assert.equal(p.alto, R.BASSO, 'punto basso: ' + p.id);
    }
  }
  assert.ok(negative > 0, 'nel campione ci sono aste affidabili con costo oltre il valore');
  // caso vero: Sant'Elpidio a Mare, lotto uno, sconto 62% con valore di affidabilità alta
  const lotto = D.punti.find((p) => p.id === 'pvp-4566904');
  assert.ok(lotto && lotto.affidabile);
  assert.equal(lotto.alto, lotto.a.sconto);
  // lo stesso sconto con affidabilità bassa non diventa un'altezza
  assert.equal(R.altezza(copia(lotto.a, { affidabilita: 'bassa' })), R.BASSO);
  assert.equal(R.altezza(copia(lotto.a, { sconto: '' })), R.BASSO);
  assert.equal(R.altezza(copia(lotto.a, { sconto: 1.7 })), 1);
});

test('colore = punteggio sulla scala del sito (--s-0, --s-50, --s-100 dei due temi); grigio senza sconto affidabile', () => {
  const css = leggi('assets/css/style.css');
  const temi = [...css.matchAll(/--s-0: (#[0-9a-f]{6}); --s-50: (#[0-9a-f]{6}); --s-100: (#[0-9a-f]{6});/g)];
  assert.ok(temi.length >= 2, 'token del tema chiaro e scuro');
  const grigio = R.rgb(css.match(/--faint: (#[0-9a-f]{6})/)[1]);
  for (const t of temi) {
    const scala = { s0: R.rgb(t[1]), s50: R.rgb(t[2]), s100: R.rgb(t[3]), grigio };
    assert.deepEqual(R.colorePunteggio(0, scala), scala.s0);
    assert.deepEqual(R.colorePunteggio(50, scala), scala.s50);
    assert.deepEqual(R.colorePunteggio(100, scala), scala.s100);
    assert.deepEqual(R.colorePunteggio(150, scala), scala.s100, 'oltre 100 resta 100');
    assert.deepEqual(R.colorePunteggio(null, scala), grigio);
    const meta = R.colorePunteggio(25, scala);
    for (let k = 0; k < 3; k++) assert.equal(meta[k], Math.round((scala.s0[k] + scala.s50[k]) / 2));
    // i colori del computer sono quelli letti dal browser ("rgb(r, g, b)")
    assert.deepEqual(R.rgb('rgb(' + scala.s0.join(', ') + ')'), scala.s0);
    for (const p of R.prepara(ASTE, { oggi: OGGI }).punti) {
      const c = R.colorePunto(p, scala);
      if (!p.affidabile) assert.deepEqual(c, grigio, 'grigio anche con punteggio: ' + p.id);
      else assert.deepEqual(c, R.colorePunteggio(p.punteggio, scala));
    }
    const es = R.coloriEsagoni(scala);
    assert.equal(es.length, 6);
    assert.deepEqual(es[0], grigio); assert.deepEqual(es[1], scala.s0); assert.deepEqual(es[3], scala.s50); assert.deepEqual(es[5], scala.s100);
  }
});

test('viaggio nel tempo: i mesi delle date d\'asta in ordine, con i conteggi; il filtro del mese', () => {
  const D = R.prepara(ASTE, { oggi: OGGI });
  const chiavi = D.mesi.map((m) => m.chiave);
  assert.deepEqual(chiavi, [...chiavi].sort());
  assert.ok(chiavi.length >= 6);
  assert.equal(D.mesi.reduce((s, m) => s + m.n, 0), D.punti.filter((p) => p.mese).length);
  for (const m of D.mesi) {
    const del = R.delMese(D.punti, m.chiave);
    assert.equal(del.length, m.n, m.chiave);
    assert.equal(m.affidabili, del.filter((p) => p.affidabile).length);
    for (const p of del) assert.equal(p.mese, m.chiave);
    assert.match(m.etichetta, /^(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre) \d{4}$/);
  }
  assert.equal(R.delMese(D.punti, '').length, D.punti.length, 'tutti i mesi');
  assert.equal(R.nomeMese('2026-11'), 'novembre 2026');
  assert.equal(R.nomeMese('2027-01', true), 'gen 2027');
  // il giorno dell'asta è quello di js/formato.js (Agenzia del Demanio: a volte solo il termine per le offerte)
  for (const a of ASTE) {
    const d = Formato.date(a);
    assert.equal(R.meseDi(a), d.asta ? d.asta.data.slice(0, 7) : null, a.id);
  }
  // troppi mesi: gli ultimi diventano una voce sola, che comprende tutti quelli dopo
  const molti = [];
  for (let m = 0; m < 15; m++) molti.push({ mese: '2027-' + String(m + 1).padStart(2, '0'), affidabile: m % 2 === 0 });
  molti.forEach((p, i) => { if (i >= 12) p.mese = '2028-0' + (i - 11); });
  const mesi = R.elencoMesi(molti, OGGI, 10);
  assert.equal(mesi.length, 10);
  const ultima = mesi[9];
  assert.equal(ultima.chiave, '>2027-10');
  assert.equal(ultima.n, 6);
  assert.equal(R.delMese(molti, ultima.chiave).length, 6);
  assert.match(ultima.etichetta, /^da ottobre 2027 in poi$/);
  assert.equal(R.MAX_MESI, 10);
});

test('miglior affare: punteggio più alto tra le aste con valore affidabile, anche nel mese scelto', () => {
  const D = R.prepara(ASTE, { oggi: OGGI });
  const affidabili = D.punti.filter((p) => p.affidabile && p.punteggio != null);
  const max = Math.max(...affidabili.map((p) => p.punteggio));
  const b = R.migliore(D.punti);
  assert.equal(b.punteggio, max);
  assert.ok(b.affidabile);
  // a pari punteggio vince lo sconto più alto
  for (const p of affidabili) if (p.punteggio === max) assert.ok(p.sconto <= b.sconto);
  // un'asta senza valore affidabile non vince mai, anche con un punteggio più alto
  const finta = Object.assign({}, D.punti.find((p) => !p.affidabile), { punteggio: 100 });
  assert.equal(R.migliore(D.punti.concat([finta])), b);
  // i primi 5, in ordine
  const top = R.migliori(D.punti, 5);
  assert.equal(top.length, 5);
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].punteggio >= top[i].punteggio);
  for (const m of D.mesi) {
    const del = R.delMese(D.punti, m.chiave), bm = R.migliore(del);
    if (!m.affidabili) { assert.equal(bm, null, m.chiave); continue; }
    assert.equal(bm.mese, m.chiave);
    assert.equal(bm.punteggio, Math.max(...del.filter((p) => p.affidabile && p.punteggio != null).map((p) => p.punteggio)));
  }
  assert.equal(R.migliore([]), null);
});

test('stesso punto: i lotti con le stesse coordinate si contano (caso vero di Sant\'Elpidio a Mare)', () => {
  const D = R.prepara(ASTE, { oggi: OGGI });
  const lotto = D.punti.find((p) => p.id === 'pvp-4566904');
  const stessi = D.perPosizione[lotto.chiave];
  assert.ok(stessi.length >= 2);
  assert.equal(lotto.insieme, stessi.length);
  for (const p of stessi) { assert.equal(p.lat, lotto.lat); assert.equal(p.lng, lotto.lng); assert.equal(p.insieme, stessi.length); }
  for (const k in D.perPosizione) for (const p of D.perPosizione[k]) assert.equal(p.chiave, k);
});

test('esagoni: altezza = numero di aste, colore = sconto medio delle sole affidabili, come la mappa di calore', () => {
  const D = R.prepara(ASTE, { oggi: OGGI });
  assert.equal(R.MINIMO, Calore.MINIMO);
  assert.deepEqual(R.PASSI, Calore.PASSI);
  // le aste di una provincia come un esagono
  const perProv = {};
  for (const p of D.punti) (perProv[p.a.provincia] || (perProv[p.a.provincia] = [])).push(p);
  let colorati = 0, grigi = 0;
  for (const k in perProv) {
    const l = perProv[k], e = R.esagono(l), aff = l.filter((p) => p.affidabile);
    assert.equal(e.n, l.length);
    assert.equal(e.campione, aff.length);
    if (aff.length) assert.ok(Math.abs(e.media - aff.reduce((s, p) => s + p.sconto, 0) / aff.length) < 1e-12);
    else assert.equal(e.media, null);
    if (aff.length >= R.MINIMO) { colorati++; assert.equal(e.classe, Calore.classe(e.media)); }
    else { grigi++; assert.equal(e.classe, -1); assert.equal(e.valore, R.GRIGIO_ESAGONO); }
    // il valore cade nel colore giusto della scala a 6 colori dell'HexagonLayer (quantize sul dominio fisso)
    const [d0, d1] = R.DOMINIO_ESAGONI, indice = Math.floor((e.valore - d0) / (d1 - d0) * 6);
    assert.equal(indice, e.classe + 1, k);
  }
  assert.ok(colorati > 0 && grigi > 0, 'nel campione esagoni colorati e grigi');
  // sconto medio negativo (costo oltre il valore): prima classe, come la mappa di calore
  const neg = D.punti.filter((p) => p.affidabile && p.sconto < 0).slice(0, 3);
  assert.equal(neg.length, 3);
  assert.equal(R.esagono(neg).classe, 0);
  assert.equal(R.esagono([]).n, 0);
});

test('misure: metri per pixel con le tile da 512 px di MapLibre', () => {
  assert.ok(Math.abs(R.metriPerPixel(0, 0) - 78271.517) < 0.01);
  assert.ok(Math.abs(R.metriPerPixel(60, 1) - 78271.517 / 4) < 0.01);
});

test('pagina: script nell\'ordine giusto, librerie locali con licenza, sintassi ES5 e nessun dato di esempio', () => {
  const html = leggi('radar3d.html');
  const script = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const i = (f) => { const n = script.indexOf(f); assert.ok(n >= 0, f + ' non è caricato'); return n; };
  for (const f of ['js/formato.js', 'js/calore.js', 'data/geo.js']) assert.ok(i(f) < i('js/radar3d-dati.js'), f);
  for (const f of ['js/radar3d-dati.js', 'data/italia.js', 'assets/vendor/maplibre-gl/maplibre-gl-csp.js', 'assets/vendor/deck.gl/core.min.js',
    'assets/vendor/deck.gl/layers.min.js', 'assets/vendor/deck.gl/aggregation-layers.min.js', 'assets/vendor/deck.gl/mapbox.min.js']) assert.ok(i(f) < i('js/pages/radar3d.js'), f);
  assert.ok(i('assets/vendor/deck.gl/core.min.js') < i('assets/vendor/deck.gl/layers.min.js'));
  assert.ok(i('js/pages/radar3d.js') < i('data/aste.js'), 'lo sfondo parte prima delle aste');
  assert.ok(!/https?:\/\/[^"]*\.js"/.test(html), 'nessuna libreria da CDN');
  // librerie in versioni esatte, con le licenze del pacchetto nella stessa cartella
  assert.ok(/v5\.24\.0\/LICENSE/.test(leggi('assets/vendor/maplibre-gl/maplibre-gl-csp.js').slice(0, 300)), 'MapLibre GL JS 5.24.0');
  assert.match(leggi('assets/vendor/maplibre-gl/LICENSE.txt'), /Redistribution and use in source and binary forms/);
  // deck.gl 9.3.11: la versione che il pacchetto dichiara in globalThis.deck (luma.gl incluso nel pacchetto ha la sua)
  for (const f of ['core', 'layers', 'aggregation-layers', 'mapbox']) assert.ok(fs.existsSync(path.join(RADICE, 'assets/vendor/deck.gl/' + f + '.min.js')), f);
  assert.ok(leggi('assets/vendor/deck.gl/core.min.js').includes('let t="9.3.11",e=globalThis.deck'), 'deck.gl 9.3.11');
  assert.match(leggi('assets/vendor/deck.gl/LICENSE'), /^Copyright Vis\.gl contributors[\s\S]*Permission is hereby granted, free of charge/);
  // il worker di MapLibre è un file del sito (niente worker blob:)
  assert.match(leggi('js/pages/radar3d.js'), /setWorkerUrl\('assets\/vendor\/maplibre-gl\/maplibre-gl-csp-worker\.js'\)/);
  assert.ok(fs.existsSync(path.join(RADICE, 'assets/vendor/maplibre-gl/maplibre-gl-csp-worker.js')));
  // le altre pagine non caricano le librerie del radar
  for (const f of fs.readdirSync(RADICE).filter((x) => x.endsWith('.html') && x !== 'radar3d.html')) {
    assert.doesNotMatch(leggi(f), /maplibre|deck\.gl/, f);
  }
  for (const f of ['js/radar3d-dati.js', 'js/pages/radar3d.js']) {
    const t = leggi(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\\n])*'/g, "''");
    assert.doesNotMatch(t, /=>/, f + ': arrow function');
    assert.doesNotMatch(t, /`/, f + ': template literal');
    assert.doesNotMatch(t, /\b(let|const|class)\s/, f + ': let, const o class');
  }
  const js = leggi('js/pages/radar3d.js');
  assert.doesNotMatch(js, /Math\.random/, 'nessun dato inventato');
  assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /href="mappa\.html"/, 'ripiego con il link alla mappa 2D');
  assert.match(leggi('mappa.html'), /href="radar3d\.html"/, 'la mappa 2D porta al radar');
});
