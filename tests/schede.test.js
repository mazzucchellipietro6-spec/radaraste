// Card delle aste in elenco (js/schede.js): livello del titolo, data dell'asta e termine per le offerte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');

// js/schede.js è solo per il browser: si esegue con la UI vera in un contesto finto
function schede() {
  const ascolti = [];
  const finto = {
    location: { pathname: '/aste.html', search: '' }, navigator: { userAgent: 'node' }, matchMedia: () => ({ matches: false }), addEventListener() {},
    document: { getElementById: () => null, addEventListener(tipo, f, cattura) { ascolti.push({ tipo, f, cattura }); }, querySelector: () => null, querySelectorAll: () => [], documentElement: { setAttribute() {}, getAttribute: () => null } },
    console, Intl, Date, Math, JSON, Number, String, isFinite, isNaN, encodeURIComponent
  };
  finto.window = finto;
  const ctx = vm.createContext(finto);
  for (const f of ['config/tariffe.js', 'js/icone.js', 'js/ui.js', 'js/formato.js', 'js/calcoli.js', 'js/schede.js', 'js/affari.js']) vm.runInContext(fs.readFileSync(path.join(RADICE, f), 'utf8'), ctx, { filename: f });
  return { S: ctx.Schede, U: ctx.UI, A: ctx.Affari, ascolti };
}

// asta reale del Demanio (raccolta del 22/10/2026) con i campi del nuovo lettore: asta l'11/11, offerte entro il 10/11 alle 16
const VENETO = { id: 'dem-Asta-pubblica-per-la-vendita-di-n.-25-lotti-di-beni-mobili-di-competenza-della-D', titolo: 'Asta pubblica per la vendita di n. 25 lotti di beni mobili di competenza della Direzione Regionale Veneto',
  categoria: 'auto', tipo: 'Asta pubblica', regione: 'Veneto', provincia: 'VE', comune: 'Mestre', fonte: 'Agenzia del Demanio', dataAsta: '2026-11-11', ora: '', termineOfferte: '2026-11-10T16:00',
  stato: 'nd', linkAvviso: 'https://www.agenziademanio.it/it/gare-aste/beni-mobili-e-veicoli-confiscati/gara/Asta-pubblica-per-la-vendita-di-n.-25-lotti-di-beni-mobili-di-competenza-della-Direzione-Regionale-Veneto' };

test('card: il titolo è un h3 (le card stanno sotto un h2 in home ed elenco aste) con la classe del suo aspetto', () => {
  const { S } = schede();
  const h = S.card(VENETO, {});
  assert.match(h, /<h3 class="card-titolo"><a href="scheda\.html\?id=dem-Asta-pubblica/);
  assert.doesNotMatch(h, /<h4/);
  const css = fs.readFileSync(path.join(RADICE, 'assets/css/style.css'), 'utf8');
  // stesso aspetto del vecchio h4: carattere del testo, 16px, grassetto, niente maiuscoletto
  assert.match(css, /\.card \.card-titolo \{ font-family: var\(--f-body\); font-size: 16px; font-weight: 600; line-height: 1\.4; letter-spacing: -\.005em; text-transform: none; color: var\(--fg\);/);
  assert.doesNotMatch(css, /\.card h4/);
});

test('card del Demanio: data dell\'asta come "Asta" e, sotto, il termine per le offerte con l\'ora', () => {
  const { S, U } = schede();
  const h = S.card(VENETO, {});
  assert.match(h, /<span class="sr-only">Asta: <\/span>/);
  assert.ok(h.includes('Offerte entro il ' + U.dataIt('2026-11-10') + ', 16:00'), h);
  // avviso senza il giorno dell'asta: la data è il termine, e lo si dice con una scritta visibile (non solo per i lettori di schermo)
  const solo = S.card({ ...VENETO, dataAsta: '2026-11-06', ora: '12:00', termineOfferte: '2026-11-06T12:00' }, {});
  assert.ok(solo.includes('<span>Offerte entro ' + U.dataIt('2026-11-06') + ', 12:00</span>'), solo);
  assert.doesNotMatch(solo, /sr-only">(Asta|Termine offerte): /);
  assert.equal((solo.match(/Offerte entro/g) || []).length, 1, 'una riga sola, senza la riga del termine sotto');
  // PVP: termine con l'ora dal dettaglio (prima compariva "2026-12-02T12:00" così com'era)
  const pvp = S.card({ id: 'pvp-4595365', titolo: 'Merci in giacenza', categoria: 'beni', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-12-03', ora: '09:30', termineOfferte: '2026-12-02T12:00', prezzoBase: 114393.6 }, {});
  assert.ok(pvp.includes('Offerte entro il ' + U.dataIt('2026-12-02') + ', 12:00'), pvp);
  assert.doesNotMatch(pvp, /T12:00/);
});

test('card: date del Demanio raccolte prima del 26/10 (senza termineOfferte) e termine del PVP nel giorno stesso dell\'asta', () => {
  const { S, U } = schede();
  // stessa vendita nei dati locali del 22/10/2026: dataAsta era il termine per le offerte (10/11 alle 16:00)
  const vecchia = S.card({ ...VENETO, dataAsta: '2026-11-10', ora: '16:00', termineOfferte: undefined }, {});
  assert.ok(vecchia.includes('<span>Offerte entro ' + U.dataIt('2026-11-10') + ', 16:00</span>'), vecchia);
  assert.doesNotMatch(vecchia, /sr-only">Termine offerte/);
  // asta il giorno stesso del termine, a un'altra ora (dato dell'avviso): si dice anche l'ora del termine
  const stessoGiorno = S.card({ ...VENETO, dataAsta: '2026-11-10', ora: '', termineOfferte: '2026-11-10T09:00' }, {});
  assert.match(stessoGiorno, /<span class="sr-only">Asta: <\/span>/);
  assert.ok(stessoGiorno.includes('Offerte entro il ' + U.dataIt('2026-11-10') + ', 09:00'), stessoGiorno);
  // PVP: 152 aste nei dati del 13/10 hanno il termine con l'ora nel giorno dell'asta; la riga del termine resta
  const pvp = S.card({ id: 'pvp-x', titolo: 'Box', categoria: 'immobile', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-11-20', ora: '15:00', termineOfferte: '2026-11-20T12:00', prezzoBase: 10000 }, {});
  assert.ok(pvp.includes('Offerte entro il ' + U.dataIt('2026-11-20') + ', 12:00'), pvp);
  // termine senza ora nel giorno dell'asta: nessuna riga in più
  assert.doesNotMatch(S.card({ id: 'pvp-y', titolo: 'Box', categoria: 'immobile', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-11-20', ora: '15:00', termineOfferte: '2026-11-20', prezzoBase: 10000 }, {}), /Offerte entro/);
});

test('card del Demanio con il solo termine (dati locali del 28/10/2026): si legge "Offerte entro 6 nov 2026, 16:00", non una data che sembra l\'asta', () => {
  const { S } = schede();
  // vendita reale della raccolta del 28/10: il Demanio scrive solo il termine per le offerte (06/11/2026 alle 16:00)
  const metallo = { id: 'dem-Asta-pubblica-per-la-vendita-di-n.-1-lotto-di-materiale-metallico-di-competenza-', titolo: 'Asta pubblica per la vendita di n. 1 lotto di materiale metallico di competenza della Direzione Regionale Veneto',
    categoria: 'beni', tipo: 'Asta pubblica', regione: 'Veneto', provincia: 'VE', comune: 'Venezia', fonte: 'Agenzia del Demanio', dataAsta: '2026-11-06', ora: '16:00', termineOfferte: '2026-11-06T16:00', stato: 'nd',
    linkAvviso: 'https://www.agenziademanio.it/it/gare-aste/beni-mobili-e-veicoli-confiscati/gara/Asta-pubblica-per-la-vendita-di-n.-1-lotto-di-materiale-metallico-di-competenza-della-Direzione-Regionale-Veneto' };
  const h = S.card(metallo, {});
  const riga = h.match(/<div class="quando">[\s\S]*?<\/div>/)[0].replace(/<svg[\s\S]*?<\/svg>/, '').replace(/<b[^>]*>[\s\S]*?<\/b>/, '').replace(/<[^>]+>/g, '');
  assert.equal(riga, 'Offerte entro 6 nov 2026, 16:00');
  // il PVP con il giorno dell'asta resta com'era: data dell'asta senza scritta visibile
  const pvp = S.card({ id: 'pvp-z', titolo: 'Box', categoria: 'immobile', fonte: 'Portale Vendite Pubbliche', dataAsta: '2026-11-20', ora: '15:00', prezzoBase: 10000 }, {});
  assert.match(pvp, /<span><span class="sr-only">Asta: <\/span>20 nov 2026, 15:00<\/span>/);
});

/* ---------- foto di copertina (prima foto della scheda del Portale, data/aste.js → copertina) ---------- */

const FOTO = 'https://resource-pvp.giustizia.it/immagini-beni/4652637/3223290/IMG_1234.jpg?versionId=0e101e81-ebe3-4107-8309-e5d052acc1fe';
// asta reale del PVP nei dati locali del 3/11/2026 (pvp-4652637, una foto nella scheda)
const MOBILE = { id: 'pvp-4652637', titolo: 'N°1 mobile a parete con due cassetti grandi nella parte bassa e cinque ante nella parte bassa in laminato color noce',
  categoria: 'beni', tipo: 'Arredamento elettrodomestici', regione: 'Lombardia', provincia: 'BS', comune: 'San Zeno Naviglio', tribunale: 'Brescia', fonte: 'Portale Vendite Pubbliche',
  prezzoBase: 268, offertaMinima: 201, dataAsta: '2026-11-10', ora: '13:30', linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=4652637', nFoto: 1 };

test('card con la copertina: foto in alto, proporzioni fisse, lazy, async, senza referrer, alt con il titolo breve e icona della categoria sotto', () => {
  const { S, U } = schede();
  const h = S.card({ ...MOBILE, copertina: FOTO }, {});
  assert.match(h, /^<article class="card cat-beni con-foto">/);
  const foto = h.match(/<div class="foto-cop">[\s\S]*?<\/div>/)[0];
  // prima la foto, poi la testata con il punteggio
  assert.ok(h.indexOf('class="foto-cop"') < h.indexOf('class="copertina"'));
  const img = foto.match(/<img [^>]+>/)[0];
  assert.ok(img.includes('src="' + U.esc(FOTO) + '"'), img);
  for (const a of ['loading="lazy"', 'decoding="async"', 'referrerpolicy="no-referrer"', 'data-copertina']) assert.ok(img.includes(a), a);
  const alt = img.match(/alt="([^"]*)"/)[1].replace(/&#39;/g, "'");
  assert.equal(alt, 'Foto dall\'avviso dell\'asta: N°1 mobile a parete con due cassetti grandi nella parte bassa e…');
  assert.ok(alt.length <= 'Foto dall\'avviso dell\'asta: '.length + 71);
  // l'icona della categoria (beni) è già nel riquadro, sotto la foto, con la scritta per quando la foto non si apre
  assert.match(foto, /<svg[^>]*class="[^"]*icona-cat/);
  assert.ok(foto.indexOf('icona-cat') < foto.indexOf('<img'));
  assert.match(foto, /<span class="foto-ko">Foto non disponibile<\/span>/);
  // titolo corto: intero; senza titolo: niente due punti appesi
  assert.match(S.card({ ...MOBILE, titolo: 'Furgone FIAT Ducato', categoria: 'auto', copertina: FOTO }, {}), /alt="Foto dall&#39;avviso dell&#39;asta: Furgone FIAT Ducato"/);
  assert.match(U.fotoCopertina({ copertina: FOTO }), /alt="Foto dall&#39;avviso dell&#39;asta"/);
  // nel riepilogo della home e negli affari la copertina può essere il solo percorso: l'indirizzo si ricostruisce con il dominio giusto
  assert.ok(U.fotoCopertina({ ...MOBILE, copertina: 'immagini-beni/1/2/a.jpg' }).includes('src="https://resource-pvp.giustizia.it/immagini-beni/1/2/a.jpg"'));
});

test('card senza copertina (o con un indirizzo non ammesso): uguale a prima, nessuna immagine e nessun riquadro', () => {
  const { S, U } = schede();
  const senza = S.card(MOBILE, {});
  assert.doesNotMatch(senza, /foto-cop|con-foto|<img/);
  assert.match(senza, /^<article class="card cat-beni">/);
  for (const v of ['https://esempio.invalid/a.jpg', 'http://resource-pvp.giustizia.it/a.jpg', '//esempio.invalid/a.jpg', 'javascript:alert(1)//a.jpg', 'https://resource-pvp.giustizia.it/a.pdf', '', null]) {
    assert.equal(S.card({ ...MOBILE, copertina: v }, {}), senza, String(v));
    assert.equal(U.fotoCopertina({ ...MOBILE, copertina: v }), '');
  }
  // anche le card compatte della home
  assert.doesNotMatch(S.card(MOBILE, { compatta: true }), /foto-cop|<img/);
  assert.match(S.card({ ...MOBILE, copertina: FOTO }, { compatta: true }), /class="card cat-beni con-foto compatta"/);
});

test('foto che non si apre: via l\'immagine rotta, resta l\'icona della categoria con "Foto non disponibile"; foto arrivata: icona nascosta', () => {
  const { ascolti } = schede();
  const errore = ascolti.find((x) => x.tipo === 'error'), carica = ascolti.find((x) => x.tipo === 'load');
  // gli eventi delle immagini non risalgono: si ascoltano in cattura
  assert.ok(errore && errore.cattura === true && carica && carica.cattura === true);
  const riquadro = () => {
    const box = { classi: [], tolta: null, classList: { add(c) { box.classi.push(c); } }, removeChild(x) { box.tolta = x; } };
    const img = { tagName: 'IMG', parentNode: box, hasAttribute: (k) => k === 'data-copertina' };
    return { box, img };
  };
  const r = riquadro();
  errore.f({ type: 'error', target: r.img });
  assert.equal(r.box.tolta, r.img);
  assert.deepEqual(r.box.classi, ['senza-foto']);
  const ok = riquadro();
  carica.f({ type: 'load', target: ok.img });
  assert.equal(ok.box.tolta, null);
  assert.deepEqual(ok.box.classi, ['caricata']);
  // le altre immagini del sito (galleria della scheda, mappa) non si toccano
  const altra = riquadro(); altra.img.hasAttribute = () => false;
  errore.f({ type: 'error', target: altra.img });
  assert.equal(altra.box.tolta, null);
  errore.f({ type: 'error', target: { tagName: 'SCRIPT' } });
  // CSS: riquadro 16:9 anche quando la foto manca; l'icona resta visibile e la scritta compare solo con la foto rotta
  const css = fs.readFileSync(path.join(RADICE, 'assets/css/style.css'), 'utf8');
  assert.match(css, /\.foto-cop \{[^}]*aspect-ratio: 16 \/ 9;[^}]*background: var\(--surface-2\)/);
  assert.match(css, /\.foto-cop img \{[^}]*position: absolute; inset: 0;[^}]*object-fit: cover/);
  assert.match(css, /\.foto-cop \.foto-ko \{ display: none;/);
  assert.match(css, /\.foto-cop\.senza-foto \.foto-ko \{ display: block; \}/);
  assert.match(css, /\.foto-cop\.caricata \.icona-cat \{ visibility: hidden; \}/);
  assert.doesNotMatch(css, /\.senza-foto[^{]*\{[^}]*(display: none|visibility: hidden)/, 'con la foto rotta nulla si nasconde');
  assert.match(css, /\.card\.con-foto \{ grid-template-rows: auto auto 1fr; \}/);
});

test('affari di oggi: la card ha la foto in alto solo con la copertina', () => {
  const { A } = schede();
  const a = { ...MOBILE, motivo: 'nuova', punteggio: 60, sconto: 0.3, offertaMax: 200, riassunto: {} };
  const con = A.card({ ...a, copertina: FOTO }, 0);
  assert.match(con, /^<article class="aff-card rivela con-foto" style="--i:0"><div class="foto-cop">/);
  assert.match(con, /referrerpolicy="no-referrer"/);
  const senza = A.card(a, 0);
  assert.doesNotMatch(senza, /foto-cop|con-foto|<img/);
  assert.equal(A.card({ ...a, copertina: 'https://esempio.invalid/x.jpg' }, 0), senza);
});
