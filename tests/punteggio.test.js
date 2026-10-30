const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../config/tariffe.js');
const P = require('../js/punteggio.js');

const base = { categoria: 'immobile', tipo: 'Immobile residenziale', comune: 'Genova', provincia: 'GE', stato: 'libero', rischi: [] };

test('senza stima né storico non c\'è valore né punteggio', () => {
  const r = P.valuta({ ...base, prezzoBase: 90000 }, { T });
  assert.equal(r.valore, null);
  assert.equal(r.punteggio, null);
  assert.match(r.mancanti.join(), /valore di mercato/);
});

test('prezzo base mancante o zero: nessun calcolo', () => {
  const r = P.valuta({ ...base, prezzoBase: 0, stima: 100000 }, { T });
  assert.equal(r.punteggio, null);
});

test('stima del perito, terza asta, libero e senza rischi: punteggio alto e forchetta ±10%', () => {
  const r = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3 }, { T });
  assert.equal(r.valore.fonte, 'perizia');
  assert.equal(r.valore.min, 180000);
  assert.equal(r.valore.max, 220000);
  // costo = 90.000 + 9% registro + 50 + 50 + 1.500 spese = 99.700
  assert.equal(r.costoTotale, 99700);
  assert.ok(Math.abs(r.sconto - 0.5015) < 0.001);
  assert.equal(r.parti.sconto, 40);
  assert.equal(r.parti.tentativo, 9);
  assert.equal(r.parti.occupazione, 13);
  assert.equal(r.parti.rischi, 20);
  assert.equal(r.punteggio, 89);
  // offerta massima: costo totale entro l'80% del valore minimo (180.000 × 0,8 = 144.000)
  assert.ok(r.offertaMax > 120000 && r.offertaMax < 132000, String(r.offertaMax));
});

test('metri quadri assenti abbassano l\'affidabilità', () => {
  const r = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, tentativo: 2 }, { T });
  assert.equal(r.valore.affidabilita, 'bassa');
  assert.match(r.valore.controlli.join(), /Metri quadri/);
  assert.equal(r.completo, false);
});

test('prezzo base più alto della stima: dato incoerente, affidabilità bassa', () => {
  const r = P.valuta({ ...base, prezzoBase: 150000, stima: 100000, superficieMq: 80, tentativo: 1 }, { T });
  assert.equal(r.valore.affidabilita, 'bassa');
  assert.match(r.valore.controlli.join(), /incoerente/);
});

test('prima asta: il valore è il prezzo base e lo sconto è negativo (nessun affare)', () => {
  const r = P.valuta({ ...base, prezzoBase: 100000, superficieMq: 90, tentativo: 1 }, { T });
  assert.equal(r.valore.fonte, 'prima-asta');
  assert.ok(r.sconto < 0);
  assert.equal(r.parti.sconto, 0);
});

test('secondo tentativo senza stima: valore dal primo prezzo', () => {
  const r = P.valuta({ ...base, prezzoBase: 75000, primoPrezzo: 100000, superficieMq: 90, tentativo: 2 }, { T });
  assert.equal(r.valore.fonte, 'primo-prezzo');
  assert.equal(r.valore.centrale, 100000);
  assert.equal(r.valore.affidabilita, 'bassa');
});

test('rischi gravi tolgono punti, occupato vale zero', () => {
  const sano = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3 }, { T });
  const quota = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3, rischi: ['quota', 'abusi'] }, { T });
  assert.equal(quota.parti.rischi, 0);
  const occ = P.valuta({ ...base, stato: 'occupato', prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3, rischi: ['occupazione'] }, { T });
  assert.equal(occ.parti.occupazione, 0);
  assert.equal(occ.parti.rischi, 20); // l'occupazione non si conta due volte
  assert.ok(quota.punteggio < sano.punteggio && occ.punteggio < sano.punteggio);
});

test('rischi non controllati: punti neutri e segnalati come mancanti', () => {
  const a = { ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3 };
  delete a.rischi;
  const r = P.valuta(a, { T });
  assert.equal(r.parti.rischi, 10);
  assert.match(r.mancanti.join(), /rischi/);
});

test('confronto con la zona: stima fuori scala → affidabilità bassa; coerente con molte perizie → alta', () => {
  const zona = [];
  for (let i = 0; i < 12; i++) zona.push({ ...base, stima: 200000 + i * 1000, superficieMq: 100 });
  const zone = P.indiceZone(zona);
  assert.equal(zone.comune['Genova|GE'].n, 12);
  const fuori = P.valuta({ ...base, prezzoBase: 300000, stima: 900000, superficieMq: 60, tentativo: 2 }, { T, zone });
  assert.equal(fuori.valore.affidabilita, 'bassa');
  assert.match(fuori.valore.controlli.join(), /fuori scala/);
  const ok = P.valuta({ ...base, prezzoBase: 120000, stima: 200000, superficieMq: 95, tentativo: 2 }, { T, zone });
  assert.equal(ok.valore.affidabilita, 'alta');
});

test('auto: costo con diritti d\'asta e passaggio, punteggio calcolato', () => {
  const r = P.valuta({ categoria: 'auto', provincia: 'MI', prezzoBase: 5000, stima: 9000, tentativo: 2, rischi: [] }, { T });
  assert.ok(r.costoTotale > 5000);
  assert.ok(r.punteggio > 0);
  assert.equal(r.parti.occupazione, 8);
});

test('compatto e fasce', () => {
  const r = P.valuta({ ...base, prezzoBase: 90000, stima: 200000, superficieMq: 100, tentativo: 3 }, { T });
  const c = P.compatto(r);
  assert.deepEqual(Object.keys(c).sort(), ['affidabilita', 'costoTotale', 'fonteValore', 'offertaMax', 'punteggio', 'punteggioCompleto', 'sconto', 'valore', 'valoreMax', 'valoreMin']);
  assert.deepEqual(P.compatto({ valore: null }), {});
  assert.equal(P.fascia(89).chiave, 'ottimo');
  assert.equal(P.fascia(null).chiave, 'nd');
});

test('OMI: zona riconosciuta → valore dalla quotazione, forchetta min–max, affitto e rendimento nella zona', () => {
  const a = { ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, omiMin: 150000, omiMax: 210000, omiAffMin: 600, omiAffMax: 800, omiMetodo: 'indirizzo' };
  const r = P.valuta(a, { T });
  assert.equal(r.valore.fonte, 'omi');
  assert.equal(r.valore.min, 150000);
  assert.equal(r.valore.max, 210000);
  assert.equal(r.valore.affidabilita, 'media');
  assert.ok(r.rendimento > 0.08 && r.rendimento < 0.09, String(r.rendimento)); // 700 € × 12 / 99.700 € di costo = 8,4%
  assert.equal(r.parti.zona, 15);
  assert.ok(!r.mancanti.some((m) => /affitto della zona/.test(m)));
});

test('OMI e perizia concordano → affidabilità alta; molto diversi → bassa con spiegazione', () => {
  const ok = P.valuta({ ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, stima: 175000, omiMin: 150000, omiMax: 210000, omiMetodo: 'unica' }, { T });
  assert.equal(ok.valore.affidabilita, 'alta');
  const ko = P.valuta({ ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, stima: 400000, omiMin: 150000, omiMax: 210000, omiMetodo: 'indirizzo' }, { T });
  assert.equal(ko.valore.affidabilita, 'bassa');
  assert.match(ko.valore.controlli.join(), /molto diversi/);
});

test('OMI del solo comune: la stima del perito ha la precedenza; senza perizia valore OMI con affidabilità bassa', () => {
  const p = P.valuta({ ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, stima: 170000, omiMin: 150000, omiMax: 210000, omiMetodo: 'comune' }, { T });
  assert.equal(p.valore.fonte, 'perizia');
  const c = P.valuta({ ...base, prezzoBase: 90000, superficieMq: 100, tentativo: 2, omiMin: 150000, omiMax: 210000, omiMetodo: 'comune' }, { T });
  assert.equal(c.valore.fonte, 'omi-comune');
  assert.equal(c.valore.affidabilita, 'bassa');
});

test('OMI molto più alto del prezzo della prima asta (caso reale Bonea): si usa il valore più basso, affidabilità bassa', () => {
  // fabbricato antico di 167 mq: OMI 100.200–133.600 €, prima asta 51.770 €, oggi terzo tentativo a 21.840 €
  const a = { ...base, prezzoBase: 21840, superficieMq: 167, tentativo: 3, primoPrezzo: 51770, omiMin: 100200, omiMax: 133600, omiMetodo: 'indirizzo' };
  const r = P.valuta(a, { T });
  assert.equal(r.valore.fonte, 'primo-prezzo');
  assert.equal(r.valore.centrale, 51770);
  assert.equal(r.valore.affidabilita, 'bassa');
  assert.match(r.valore.controlli.join(), /molto diversi: uso il più basso/);
});

test('perizia più bassa dell\'OMI ma vicina (entro il 50%): vale la perizia, affidabilità media', () => {
  const a = { ...base, prezzoBase: 40000, superficieMq: 100, tentativo: 2, stima: 105000, omiMin: 150000, omiMax: 210000, omiMetodo: 'indirizzo' };
  const r = P.valuta(a, { T });
  assert.equal(r.valore.fonte, 'perizia');
  assert.equal(r.valore.affidabilita, 'media');
  assert.match(r.valore.controlli.join(), /sono diversi: uso il più basso/);
});

test('OMI e prezzo della prima asta concordano: valore OMI con affidabilità alta', () => {
  const a = { ...base, prezzoBase: 60000, superficieMq: 100, tentativo: 3, primoPrezzo: 160000, omiMin: 150000, omiMax: 210000, omiMetodo: 'indirizzo' };
  const r = P.valuta(a, { T });
  assert.equal(r.valore.fonte, 'omi');
  assert.equal(r.valore.affidabilita, 'alta');
});

test('valore poco affidabile: il punteggio si ferma alla fascia "Da valutare" (mai "Ottimo affare" su dati incerti)', () => {
  const a = { ...base, prezzoBase: 21840, superficieMq: 167, tentativo: 3, primoPrezzo: 51770, omiMin: 100200, omiMax: 133600, omiMetodo: 'indirizzo', stato: 'libero', rischi: [] };
  const r = P.valuta(a, { T });
  assert.equal(r.valore.affidabilita, 'bassa');
  assert.ok(r.punteggio <= P.TETTO_INCERTO);
  assert.equal(r.limitato, true);
  assert.equal(P.fascia(r.punteggio).chiave, 'medio');
});

test('OMI oltre 3 volte il prezzo base senza perizia né prima asta: affidabilità bassa (caso reale Agrigento)', () => {
  const a = { ...base, prezzoBase: 50090, superficieMq: 400, omiMin: 260000, omiMax: 327000, omiMetodo: 'indirizzo' };
  const r = P.valuta(a, { T });
  assert.equal(r.valore.fonte, 'omi');
  assert.equal(r.valore.affidabilita, 'bassa');
  assert.match(r.valore.controlli.join(), /più di 3 volte il prezzo base/);
  // con la prima asta che conferma il valore resta affidabile
  const b = P.valuta({ ...a, tentativo: 5, primoPrezzo: 280000 }, { T });
  assert.notEqual(b.valore.affidabilita, 'bassa');
});

test('OMI molto più alto del prezzo della prima asta (+50%) non "concorda": si usa il valore più basso (caso reale pvp-4623595, box a Lerici)', () => {
  // box di 22 mq, prima asta 33.000 € andata deserta, oggi 24.750 €; OMI della zona 39.600–59.400 €
  const a = { ...base, tipo: 'Immobile commerciale', prezzoBase: 24750, superficieMq: 22, tentativo: 2, primoPrezzo: 33000,
    omiMin: 39600, omiMax: 59400, omiMetodo: 'indirizzo', stato: 'libero', rischi: ['vincoli'] };
  const r = P.valuta(a, { T });
  assert.equal(r.valore.fonte, 'primo-prezzo');
  assert.equal(r.valore.centrale, 33000);
  assert.notEqual(r.valore.affidabilita, 'alta');
  assert.match(r.valore.controlli.join(), /sono diversi: uso il più basso/);
  assert.ok(r.punteggio <= P.TETTO_INCERTO, String(r.punteggio));   // prima: 80, "Ottimo affare"
  // entro il 35% nei due sensi resta "alta"
  const vicino = P.valuta({ ...a, primoPrezzo: 40000 }, { T });     // 49.500 / 40.000 = 1,24
  assert.equal(vicino.valore.fonte, 'omi');
  assert.equal(vicino.valore.affidabilita, 'alta');
});

test('beni mobili: la sola stima del perito dà affidabilità bassa e il punteggio si ferma al tetto (casi reali di Nuoro del 13/10)', () => {
  // pvp-4595365 "Merci in giacenza" e pvp-4594979 "Mobili da ufficio" (Tribunale di Nuoro, R.G.E. 19/2017, secondo tentativo):
  // prima del controllo punteggio 77 ("Ottimo affare") con affidabilità media
  const merci = { id: 'pvp-4595365', titolo: 'Merci in giacenza', categoria: 'beni', tipo: 'Altra categoria m', provincia: 'NU', comune: 'Nuoro',
    prezzoBase: 114393.6, offertaMinima: 114393.6, stato: 'nd', rischi: [], tentativo: 2, deserte: 1, primoPrezzo: 142992, stima: 238320.07 };
  const mobili = { id: 'pvp-4594979', titolo: 'Mobili da ufficio', categoria: 'beni', tipo: 'Altra categoria m', provincia: 'NU', comune: 'Nuoro',
    prezzoBase: 3060, offertaMinima: 3060, stato: 'nd', rischi: [], tentativo: 2, deserte: 1, primoPrezzo: 3825, stima: 6375 };
  for (const a of [merci, mobili]) {
    const r = P.valuta(a, { T });
    assert.equal(r.valore.fonte, 'perizia', a.id);
    assert.equal(r.valore.affidabilita, 'bassa', a.id);
    assert.equal(r.punteggio, P.TETTO_INCERTO, a.id);
    assert.equal(r.limitato, true, a.id);
    assert.notEqual(P.fascia(r.punteggio).chiave, 'ottimo', a.id);
    assert.equal(r.completo, false, a.id);
    assert.match(r.valore.controlli.join(' '), /^Bene mobile: il valore viene solo dalla stima del perito, senza una seconda fonte che lo confermi/, a.id);
    assert.match(r.valore.controlli.join(' '), /al massimo 54 \("Da valutare"\)/, a.id);
  }
  // veicoli e immobili non cambiano: un'auto con la stima del perito resta ad affidabilità media
  assert.equal(P.valuta({ categoria: 'auto', provincia: 'MI', prezzoBase: 5000, stima: 9000, tentativo: 2, rischi: [] }, { T }).valore.affidabilita, 'media');
});

test('caso del 29/10/2026, lotto uno di Sant\'Elpidio a Mare (pvp-4566904): valore OMI confermato dal perito, non gonfiato', () => {
  // campi pubblicati in data/aste.js (raccolta del 29/10/2026): laboratorio C/3 di 828 mq, zona OMI E1 "Casette d'Ete -
  // Cascinare" dall'indirizzo, Laboratori 510–660 €/mq (semestre 2025/2) → 422.280–546.480 €; prima asta 534.800 € (06/11/2024)
  const a = { categoria: 'immobile', tipo: 'Immobile industriale', comune: 'Sant\'Elpidio a Mare', provincia: 'FM', stato: 'nd', rischi: [],
    prezzoBase: 169214.06, superficieMq: 828, tentativo: 3, primoPrezzo: 534800,
    omiMin: 422280, omiMax: 546480, omiAffMin: 2153, omiAffMax: 2732, omiMetodo: 'indirizzo' };
  const r = P.valuta(a, { T });
  // OMI e prima asta concordano (534.800 / 484.380 = 1,10): valore OMI con affidabilità alta
  assert.equal(r.valore.fonte, 'omi');
  assert.equal(r.valore.centrale, 484380);
  assert.equal(r.valore.affidabilita, 'alta');
  assert.equal(r.sconto, 0.616);
  assert.equal(r.offertaMax, 308400);
  assert.equal(r.punteggio, 90);
  // lo sconto viene dai ribassi, non dal valore: il prezzo base è la prima asta con quattro ribassi del 25%
  // (534.800 × 0,75⁴ = 169.214,06), anche se l'indice del portale ha solo due tentativi precedenti (tentativo 3)
  assert.equal(Math.round(534800 * Math.pow(0.75, 4) * 100) / 100, a.prezzoBase);
  // i lotti due e tre nello stesso punto (pvp-4620343 e pvp-4620348) sono altre unità di 124 mq al secondo tentativo:
  // costo oltre il valore, sconto -8%
  const lotto3 = P.valuta({ ...a, tipo: 'Immobile residenziale', prezzoBase: 131100, superficieMq: 124, tentativo: 2, primoPrezzo: 174800,
    omiMin: 111600, omiMax: 155000, omiAffMin: 446, omiAffMax: 632 }, { T });
  assert.equal(lotto3.sconto, -0.084);
});

test('tentativo minimo dai prezzi quando nell\'indice del Portale mancano aste intermedie (stima dichiarata, 30/10/2026)', () => {
  // pvp-4566904, Sant'Elpidio a Mare: indice con 534.800 € (06/11/2024) e 225.618,75 € (29/07/2026), oggi 169.214,06 €:
  // 534.800 × 0,75⁴ = 169.214,06 → almeno il 5° tentativo, il sito diceva 3°
  const base = { categoria: 'immobile', tentativo: 3, primoPrezzo: 534800, prezzoBase: 169214.06 };
  assert.deepEqual(P.tentativoMinimo(base), { tentativo: 5, ribassi: 4 });
  // pvp-4381614, Melilli: 78.000 → 58.500 → 43.875 → 24.679,69 (l'ultimo salto è di due ribassi): almeno il 5°, l'indice dice 4°
  assert.deepEqual(P.tentativoMinimo({ categoria: 'immobile', tentativo: 4, primoPrezzo: 78000, prezzoBase: 24679.69 }), { tentativo: 5, ribassi: 4 });
  // nessuna stima quando l'indice è già completo (Treia, pvp-4636073: 107.239 → 80.430 → 60.323, 3° tentativo)...
  assert.equal(P.tentativoMinimo({ categoria: 'immobile', tentativo: 3, primoPrezzo: 107239, prezzoBase: 60323 }), null);
  // ...quando un ribasso non è del 25% (pvp-4622646, Montegranaro: 267.200 × 0,75⁴ = 84.543,75 ma il prezzo è 83.543,75)...
  assert.equal(P.tentativoMinimo({ categoria: 'immobile', tentativo: 3, primoPrezzo: 267200, prezzoBase: 83543.75 }), null);
  // ...quando i ribassi sono del 20% (pvp-4647168, Roma: 590.000 → 472.000 → 377.600) e per i beni mobili
  assert.equal(P.tentativoMinimo({ categoria: 'immobile', tentativo: 3, primoPrezzo: 590000, prezzoBase: 377600 }), null);
  assert.equal(P.tentativoMinimo({ ...base, categoria: 'beni' }), null);
  // il punteggio non cambia: la stima si dice, non entra nei calcoli
  const a = { provincia: 'FM', tipo: 'Immobile industriale', stato: 'nd', rischi: [], superficieMq: 828, omiMin: 422280, omiMax: 546480, omiMetodo: 'indirizzo', ...base };
  assert.equal(P.valuta(a, { T }).parti.tentativo, 9);
});
