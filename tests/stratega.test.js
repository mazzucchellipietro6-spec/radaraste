const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../config/tariffe.js');
const C = require('../js/calcoli.js');
const S = require('../js/stratega.js');

const OGGI = '2026-10-13';
let N = 0;
function asta(x) {
  N++;
  return {
    id: 'pvp-' + N, titolo: 'Appartamento – Genova', categoria: 'immobile', tipo: 'Immobile residenziale', regione: 'Liguria', provincia: 'GE',
    comune: 'Genova', tribunale: 'Genova', rge: String(100 + N), annoProcedura: '2024', prezzoBase: 90000, offertaMinima: 67500, dataAsta: '2026-12-01',
    stato: 'libero', linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=' + N, tentativo: 1, valore: 200000, valoreMin: 180000,
    valoreMax: 220000, fonteValore: 'perizia', affidabilita: 'media', offertaMax: 125000, ...x
  };
}
const conta = (aggiudicate, deserte, ignote, p, pMin, pMax) => ({ aggiudicate, deserte, ignote, n: aggiudicate + deserte + ignote, p, pMin, pMax });
// statistiche sintetiche con la stessa forma di scripts/lib/statistiche.mjs
function statistiche(residenzialeT1) {
  const vuoto = conta(0, 0, 0, null, null, null);
  return {
    fonte: 'Portale delle Vendite Pubbliche – esiti delle vendite dal 01/01/2026 al 27/09/2026', periodo: { dal: '2026-01-01', al: '2026-09-27' },
    avvertenze: ['Avvertenza di prova sui dati.'],
    gruppi: {
      residenziale: { ...conta(40, 60, 100, 0.4, 0.2, 0.7), tentativi: { 1: residenzialeT1 || conta(30, 30, 40, 0.5, 0.3, 0.7), 2: conta(5, 10, 5, null, 0.25, 0.5), 3: vuoto, '4+': vuoto } },
      'altri-immobili': { ...conta(2, 3, 1, null, 0.333, 0.5), tentativi: { 1: vuoto, 2: vuoto, 3: vuoto, '4+': vuoto } },
      veicoli: { ...conta(10, 30, 0, 0.25, 0.25, 0.25), tentativi: { 1: vuoto, 2: vuoto, 3: vuoto, '4+': vuoto } },
      beni: { ...vuoto, tentativi: { 1: vuoto, 2: vuoto, 3: vuoto, '4+': vuoto } }
    },
    totale: { ...conta(60, 140, 100, 0.3, 0.2, 0.533), tentativi: {} }
  };
}
const STAT = statistiche();

test('profilo: valori predefiniti, limiti e capitale obbligatorio', () => {
  const p = S.profilo({ capitale: '60000', orizzonteMesi: 20, concorrenza: 30, regioni: 'Liguria, Piemonte' });
  assert.equal(p.capitale, 60000);
  assert.equal(p.mutuo, 0);
  assert.equal(p.orizzonteMesi, 12);
  assert.equal(p.concorrenza, 0.3);
  assert.equal(p.concorrenzaPredefinita, false);
  assert.deepEqual(p.regioni, ['Liguria', 'Piemonte']);
  assert.equal(p.categoria, 'immobile');
  assert.equal(p.prudenza, 'prudente');
  assert.equal(p.regime, 'seconda-privato');
  assert.equal(p.valido, true);
  const d = S.profilo({});
  assert.equal(d.valido, false);
  assert.match(d.errori[0], /capitale/);
  assert.equal(d.orizzonteMesi, 6);
  assert.equal(d.concorrenza, 0.3);
  assert.equal(d.concorrenzaPredefinita, true);
  assert.equal(S.profilo({ capitale: 1, concorrenza: 0 }).concorrenza, 0);
  assert.equal(S.profilo({ capitale: 1, strategia: 'speculare', prudenza: 'folle' }).strategia, S.PROFILO_BASE.strategia);
});

test('gruppo delle statistiche', () => {
  assert.equal(S.gruppoDi({ categoria: 'immobile', tipo: 'Immobile residenziale' }), 'residenziale');
  assert.equal(S.gruppoDi({ categoria: 'immobile', tipo: 'Immobile commerciale' }), 'altri-immobili');
  assert.equal(S.gruppoDi({ categoria: 'immobile', tipo: 'Altra categoria' }), 'altri-immobili');
  assert.equal(S.gruppoDi({ categoria: 'auto', tipo: 'Autoveicoli e cicli' }), 'veicoli');
  assert.equal(S.gruppoDi({ categoria: 'moto' }), 'veicoli');
  assert.equal(S.gruppoDi({ categoria: 'beni', tipo: 'Nautica' }), 'veicoli');
  assert.equal(S.gruppoDi({ categoria: 'beni', tipo: 'Arredamento elettro' }), 'beni');
});

test('probabilità: fascia del tentativo, poi gruppo, poi totale, sempre con la fonte', () => {
  const prof = S.profilo({ capitale: 1, concorrenza: 0.3 });
  // 1° tentativo residenziale: p = 0,5 → P(vincere) = 0,5 + 0,5 × 0,3
  let r = S.probabilita(asta({ tentativo: 1 }), STAT, prof);
  assert.equal(r.livello, 'tentativo');
  assert.equal(r.altriOfferenti, 0.5);
  assert.equal(r.vincere, 0.65);
  assert.deepEqual(r.intervallo, [0.51, 0.79]);   // con pMax = 0,7 e pMin = 0,3
  assert.match(r.fonte, /tra le 60 vendite di immobili residenziali al 1° tentativo con esito noto il 50% è stato aggiudicato/);
  assert.match(r.fonte, /dal 01\/01\/2026 al 27\/09\/2026/);
  assert.match(r.ipotesi, /ipotesi tua/);
  assert.match(r.interpretazione, /almeno un offerente/);
  // 2° tentativo: meno di 30 esiti noti → tutto il gruppo
  r = S.probabilita(asta({ tentativo: 2 }), STAT, prof);
  assert.equal(r.livello, 'gruppo');
  assert.equal(r.vincere, 0.72);
  assert.match(r.fonte, /meno di 30/);
  // tentativo non noto → gruppo, detto
  r = S.probabilita(asta({ tentativo: null }), STAT, prof);
  assert.equal(r.livello, 'gruppo');
  assert.match(r.fonte, /tentativo non noto/);
  // gruppo con pochi esiti → tutte le vendite
  r = S.probabilita(asta({ tipo: 'Immobile commerciale' }), STAT, prof);
  assert.equal(r.livello, 'totale');
  assert.equal(r.altriOfferenti, 0.3);
  assert.equal(r.vincere, 0.79);
  // senza statistiche: il caso peggiore, solo l'ipotesi dell'utente
  r = S.probabilita(asta({}), null, prof);
  assert.equal(r.altriOfferenti, null);
  assert.equal(r.vincere, 0.3);
  assert.deepEqual(r.intervallo, [0.3, 1]);
  assert.match(r.fonte, /non disponibili/);
});

test('probabilità: si preferiscono le ultime settimane quando hanno abbastanza esiti', () => {
  const stat = { ...STAT, recenti: { giorni: 28, periodo: { dal: '2026-08-31', al: '2026-09-27' }, gruppi: statistiche(conta(20, 20, 10, 0.5, 0.4, 0.6)).gruppi, totale: conta(50, 50, 0, 0.5, 0.5, 0.5) } };
  stat.recenti.gruppi.residenziale.tentativi[1] = conta(30, 10, 0, 0.75, 0.75, 0.75);
  const r = S.probabilita(asta({ tentativo: 1 }), stat, S.profilo({ capitale: 1, concorrenza: 0 }));
  assert.equal(r.altriOfferenti, 0.75);
  assert.equal(r.vincere, 0.25);
  assert.equal(r.campione.recenti, true);
  assert.match(r.fonte, /dal 31\/08\/2026 al 27\/09\/2026/);
  assert.match(r.fonte, /ultime 4 settimane/);
});

test('candidati: solo aste future nell\'orizzonte, con valore affidabile e margine; scarti contati', () => {
  const aste = [
    asta({ id: 'ok' }),
    asta({ id: 'bassa', affidabilita: 'bassa' }),
    asta({ id: 'senza-valore', affidabilita: null, valoreMin: null }),
    asta({ id: 'passata', dataAsta: '2026-10-01' }),
    asta({ id: 'oggi', dataAsta: OGGI }),
    asta({ id: 'termine-scaduto', dataAsta: '2026-10-20', termineOfferte: '2026-10-10T12:00' }),
    asta({ id: 'lontana', dataAsta: '2027-06-01' }),
    asta({ id: 'altra-regione', regione: 'Sicilia' }),
    asta({ id: 'auto', categoria: 'auto', tipo: 'Autoveicoli e cicli' }),
    asta({ id: 'senza-margine', offertaMax: 60000 })
  ];
  const r = S.candidati(aste, S.profilo({ capitale: 100000, regioni: ['Liguria'] }), { T, stat: STAT, oggi: OGGI });
  assert.deepEqual(r.candidati.map((c) => c.id), ['ok']);
  assert.equal(r.esclusiBassa, 1);
  assert.equal(r.scartate['valore poco affidabile'], 1);
  assert.equal(r.scartate['valore di mercato non stimabile'], 1);
  assert.equal(r.scartate['asta passata o termine per le offerte scaduto'], 3);
  assert.equal(r.scartate['oltre l\'orizzonte di 6 mesi'], 1);
  assert.equal(r.scartate['fuori dalle regioni scelte'], 1);
  assert.equal(r.scartate['altra categoria'], 1);
  assert.equal(r.scartate['nemmeno l\'offerta minima lascia margine sul valore'], 1);
  assert.equal(r.analizzate, aste.length);
  assert.equal(r.fine, '2027-04-13');
  // orizzonte più lungo: entra anche quella di giugno 2027
  assert.equal(S.candidati(aste, S.profilo({ capitale: 1, orizzonteMesi: 9 }), { T, oggi: OGGI }).candidati.some((c) => c.id === 'lontana'), true);
  // senza offerta minima nell'avviso: 75% del prezzo base
  const s = S.candidati([asta({ offertaMinima: null, offertaMax: 66000 })], S.profilo({ capitale: 1 }), { T, oggi: OGGI });
  assert.equal(s.candidati.length, 0);
  assert.equal(S.candidati([asta({ offertaMinima: null, offertaMax: 68000 })], S.profilo({ capitale: 1 }), { T, oggi: OGGI }).candidati[0].offertaMinima, 67500);
});

test('candidati: offerta, cauzione, costo, date, guadagno atteso e affitto', () => {
  const prof = S.profilo({ capitale: 200000, concorrenza: 0.3, strategia: 'affittare' });
  const [c] = S.candidati([asta({ termineOfferte: '2026-11-28T12:00', omiAffMin: 500, omiAffMax: 700 })], prof, { T, stat: STAT, oggi: OGGI }).candidati;
  // offerta massima sopra il prezzo base → si offre il prezzo base
  assert.equal(c.offerta, 90000);
  assert.match(c.motivoOfferta, /prezzo base/);
  assert.deepEqual({ importo: c.cauzione.importo, quota: c.cauzione.quota, nota: c.cauzione.nota }, { importo: 9000, quota: 0.1, nota: 'di solito il 10%, verifica l\'avviso' });
  // 90.000 + 9% registro + 50 + 50 + 1.500 spese di procedura (stesse ipotesi di js/punteggio.js)
  assert.equal(c.costoTotale, 99700);
  assert.equal(c.costoTotale, Math.round(C.costoImmobile({ prezzoBase: 90000, offerta: 90000, regime: 'seconda-privato', speseProcedura: 1500 }, T).totale));
  assert.equal(c.cassaNecessaria, 99700);
  assert.equal(c.margine, 80300);
  assert.equal(c.guadagnoAtteso, Math.round(0.65 * 80300));
  assert.deepEqual(c.guadagnoAttesoForchetta, [Math.round(0.51 * 80300), Math.round(0.79 * 80300)]);
  assert.deepEqual(c.dataCauzione, { data: '2026-11-28', ora: '12:00', nota: 'termine per le offerte indicato nell\'avviso' });
  assert.deepEqual(c.dataSaldo, { data: '2027-03-31', nota: 'di solito entro 120 giorni, verifica l\'avviso' });
  assert.deepEqual({ min: c.renditaAnnua.min, max: c.renditaAnnua.max }, { min: 6000, max: 8400 });
  assert.match(c.renditaAnnua.fonte, /OMI/);
  assert.deepEqual(c.rendimento, { min: 0.06, max: 0.084 });
  // offerta massima tra offerta minima e prezzo base → si offre l'offerta massima, e si dice il rischio
  const [d] = S.candidati([asta({ offertaMax: 80000, stato: 'occupato' })], prof, { T, stat: STAT, oggi: OGGI }).candidati;
  assert.equal(d.offerta, 80000);
  assert.match(d.motivoOfferta, /art\. 572/);
  assert.equal(d.costoTotale, 80000 + 7200 + 100 + 1500 + 3000);   // liberazione se occupato
  assert.equal(d.dataCauzione.data, '2026-11-30');                   // senza termine: il giorno prima dell'asta
  assert.match(d.dataCauzione.nota, /verifica/);
  // cauzione indicata nell'avviso
  assert.equal(S.candidati([asta({ cauzionePerc: 20 })], prof, { T, oggi: OGGI }).candidati[0].cauzione.importo, 18000);
});

test('cassa e mutuo: mutuo solo per immobili, al massimo l\'80% dell\'offerta e la cifra disponibile', () => {
  const a = asta({});
  let [c] = S.candidati([a], S.profilo({ capitale: 100000, mutuo: 50000 }), { T, oggi: OGGI }).candidati;
  assert.equal(c.mutuoUsato, 50000);
  assert.equal(c.cassaNecessaria, 99700 - 50000);
  [c] = S.candidati([a], S.profilo({ capitale: 100000, mutuo: 500000 }), { T, oggi: OGGI }).candidati;
  assert.equal(c.mutuoUsato, 72000);   // 80% di 90.000
  assert.equal(c.cassaNecessaria, 99700 - 72000);
  const auto = asta({ categoria: 'auto', tipo: 'Autoveicoli e cicli', prezzoBase: 8000, offertaMinima: 6000, offertaMax: 9000, valoreMin: 14000 });
  [c] = S.candidati([auto], S.profilo({ capitale: 100000, mutuo: 500000, categoria: 'auto' }), { T, oggi: OGGI }).candidati;
  assert.equal(c.mutuoUsato, 0);
  assert.equal(c.cassaNecessaria, c.costoTotale);
  // il mutuo residuo si consuma: due immobili da 72.000 di mutuo possibile con 100.000 disponibili
  const due = S.candidati([asta({}), asta({ comune: 'Savona' })], S.profilo({ capitale: 100000, mutuo: 100000 }), { T, oggi: OGGI }).candidati;
  assert.equal(S.cassaSeVinciTutte(due, S.profilo({ capitale: 100000, mutuo: 100000 })), 2 * 99700 - 100000);
});

test('piano prudente: non supera mai il capitale anche vincendo tutte; diversificazione per procedura e comune', () => {
  const prof = S.profilo({ capitale: 100000, concorrenza: 1 });   // senza statistiche e con q = 1 si vince sempre
  const aste = [];
  for (let i = 0; i < 5; i++) aste.push(asta({ prezzoBase: 25000, offertaMinima: 18750, offertaMax: 40000, valoreMin: 60000 + i * 1000, comune: 'Comune' + i, dataAsta: '2026-11-0' + (i + 1) }));
  aste.push(asta({ prezzoBase: 25000, offertaMinima: 18750, offertaMax: 40000, valoreMin: 90000, comune: 'Comune0', rge: aste[0].rge }));   // stessa procedura
  const cand = S.candidati(aste, prof, { T, oggi: OGGI });
  const p = S.piano(cand, prof);
  // ogni asta costa 25.000 + 2.250 + 100 + 1.500 = 28.850: ne stanno 3 in 100.000
  assert.equal(p.scelte.length, 3);
  assert.ok(p.sintesi.cassaSeVinciTutte <= 100000);
  assert.equal(p.sintesi.cassaSeVinciTutte, 3 * 28850);
  assert.equal(new Set(p.scelte.map((c) => c.rge + '|' + c.tribunale)).size, 3);
  // il lotto migliore della procedura entra, l'altro lotto della stessa procedura no
  assert.ok(p.scelte.some((c) => c.id === aste[5].id));
  assert.match(p.escluse.find((e) => e.id === aste[0].id).motivo, /stessa procedura/);
  assert.equal(p.motivi['non pagabile se le vinci tutte'], 2);
  // in ordine di data
  assert.deepEqual(p.scelte.map((c) => c.dataAsta), p.scelte.map((c) => c.dataAsta).slice().sort());
  // vincendo sempre: cassa usata mai oltre il capitale e nessuna offerta saltata
  const sim = S.simula(p, prof, { n: 500, seme: 1 });
  assert.equal(sim.vinte.istogramma[3], 1);
  assert.ok(sim.capitaleUsato.p90 <= 100000);
  assert.equal(sim.sforamento, 0);
  assert.equal(sim.offerteSaltate.quotaGiri, 0);
  // al massimo 2 aste per comune
  const stessoComune = [];
  for (let i = 0; i < 4; i++) stessoComune.push(asta({ prezzoBase: 10000, offertaMinima: 7500, offertaMax: 20000, valoreMin: 40000 }));
  const q = S.piano(S.candidati(stessoComune, prof, { T, oggi: OGGI }), prof);
  assert.equal(q.scelte.length, 2);
  assert.equal(q.motivi['già 2 aste nello stesso comune'], 2);
  // un'asta che da sola supera il capitale
  const grande = S.piano(S.candidati([asta({ prezzoBase: 200000, offertaMinima: 150000, offertaMax: 250000, valoreMin: 400000 })], prof, { T, oggi: OGGI }), prof);
  assert.equal(grande.scelte.length, 0);
  assert.match(grande.escluse[0].motivo, /più del tuo capitale/);
  assert.match(grande.sintesi.testo, /meglio aspettare/);
});

// due aste da 56.100 € di cassa ciascuna con 100.000 € di capitale: si sfora solo vincendole entrambe.
// Statistiche: p = 0,6, forchetta 0,55–0,65, concorrenza 0 → P(vincere) 0,4 (forchetta 0,35–0,45):
// rischio di sforare offrendo a tutte = 0,45² ≈ 0,20 → equilibrata (10%) dice no, audace (25%) dice sì.
function casoRischio(prudenza) {
  const stat = statistiche(conta(36, 24, 5, 0.6, 0.55, 0.65));
  const prof = S.profilo({ capitale: 100000, concorrenza: 0, prudenza });
  const aste = [
    asta({ prezzoBase: 50000, offertaMinima: 37500, offertaMax: 70000, valoreMin: 150000, comune: 'Savona', dataAsta: '2026-11-10' }),
    asta({ prezzoBase: 50000, offertaMinima: 37500, offertaMax: 70000, valoreMin: 149000, comune: 'Imperia', dataAsta: '2026-12-10' })
  ];
  return { prof, cand: S.candidati(aste, prof, { T, stat, oggi: OGGI }) };
}

test('piano equilibrato e audace: soglia del rischio di vincere più di quanto si può pagare', () => {
  const pr = casoRischio('prudente'), eq = casoRischio('equilibrata'), au = casoRischio('audace');
  assert.equal(pr.cand.candidati[0].cassaNecessaria, 56100);
  assert.equal(pr.cand.candidati[0].probabilita.vincere, 0.4);
  assert.deepEqual(pr.cand.candidati[0].probabilita.intervallo, [0.35, 0.45]);
  assert.equal(S.piano(pr.cand, pr.prof).scelte.length, 1);
  const pe = S.piano(eq.cand, eq.prof);
  assert.equal(pe.scelte.length, 1);
  assert.ok(pe.motivi['rischio di sforare oltre la soglia'] === 1);
  assert.match(pe.escluse[0].motivo, /massimo 10%/);
  const pa = S.piano(au.cand.candidati, au.prof);   // accetta anche l'elenco semplice
  assert.equal(pa.scelte.length, 2);
  const r = S.rischio(pa.scelte, au.prof, { n: 4000, seme: 7 });
  assert.ok(r > 0.15 && r <= 0.25, String(r));
  assert.ok(pa.sintesi.rischioSforamento > 0.1 && pa.sintesi.rischioSforamento <= 0.25);
  assert.ok(pa.sintesi.cassaSeVinciTutte > au.prof.capitale);
  assert.match(pa.sintesi.regola, /25%/);
});

test('simulazione: riproducibile con lo stesso seme, nessuno sforamento con la regola sequenziale', () => {
  const { prof, cand } = casoRischio('audace');
  const p = S.piano(cand, prof);
  const a = S.simula(p, prof, { n: 3000, seme: 42 });
  const b = S.simula(p, prof, { n: 3000, seme: 42 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(S.simula(p, prof, { n: 3000, seme: 43 }).vinte.conteggi, a.vinte.conteggi);
  assert.equal(a.n, 3000);
  assert.equal(a.vinte.istogramma.length, 3);
  assert.equal(a.sforamento, 0);
  // se vinci la prima (≈ 40%) la seconda va saltata: la cassa non basta
  assert.ok(Math.abs(a.offerteSaltate.quotaGiri - 0.4) < 0.04, String(a.offerteSaltate.quotaGiri));
  assert.equal(a.vinte.istogramma[2], 0);
  assert.ok(Math.abs(a.perAsta[0].vinta - 0.4) < 0.04);
  assert.ok(Math.abs(a.almenoUna - (0.4 + 0.6 * 0.4)) < 0.04, String(a.almenoUna));
  assert.ok(a.capitaleUsato.p90 <= prof.capitale);
  assert.ok(a.guadagno.media > 0);
  assert.deepEqual(Object.keys(a.capitaleUsato), ['p10', 'p50', 'p90', 'media']);
  // forchetta con le probabilità agli estremi
  assert.ok(a.forchetta.almenoUna[0] < a.almenoUna && a.almenoUna < a.forchetta.almenoUna[1]);
  // stessa data: la cassa della prima offerta resta da parte, la seconda si salta sempre
  const stessoGiorno = S.candidati([
    asta({ prezzoBase: 50000, offertaMinima: 37500, offertaMax: 70000, valoreMin: 150000, comune: 'Savona', dataAsta: '2026-11-10' }),
    asta({ prezzoBase: 50000, offertaMinima: 37500, offertaMax: 70000, valoreMin: 149000, comune: 'Imperia', dataAsta: '2026-11-10' })
  ], prof, { T, stat: statistiche(conta(36, 24, 5, 0.6, 0.55, 0.65)), oggi: OGGI }).candidati;
  const s = S.simula(stessoGiorno, prof, { n: 1000, seme: 3 });
  assert.equal(s.offerteSaltate.quotaGiri, 1);
  assert.equal(s.sforamento, 0);
});

test('chi vuole viverci cerca una sola casa', () => {
  const prof = S.profilo({ capitale: 500000, concorrenza: 1, strategia: 'vivere' });
  const aste = [asta({ comune: 'A', dataAsta: '2026-11-05' }), asta({ comune: 'B', dataAsta: '2026-11-20' }), asta({ tipo: 'Immobile commerciale', comune: 'C' })];
  const cand = S.candidati(aste, prof, { T, oggi: OGGI });
  assert.equal(cand.scartate['non è un immobile residenziale'], 1);
  const sim = S.simula(S.piano(cand, prof), prof, { n: 200, seme: 5 });
  assert.equal(sim.vinte.istogramma[1], 1);
  assert.equal(sim.perAsta[1].nonServe, 1);
  // una cifra sola per il guadagno: la somma diretta conta anche la seconda casa, che non serve; la sintesi non la scrive
  const ris = S.esegui(aste, { capitale: 500000, concorrenza: 1, strategia: 'vivere' }, { T, oggi: OGGI, n: 200, seme: 5 });
  assert.ok(ris.piano.sintesi.guadagnoAttesoTotale > ris.simulazione.guadagno.media * 1.5, 'qui le due cifre sono molto diverse');
  assert.doesNotMatch(ris.piano.sintesi.testo, /[Gg]uadagno|margine/);
  assert.match(ris.piano.sintesi.testo, /^Piano con 2 aste .* di cassa su 500\.000 €\.$/);
});

test('spiega: ipotesi con le fonti, cosa non si sa e avvertenza finale', () => {
  const aste = [asta({}), asta({ affidabilita: 'bassa' })];
  const ris = S.esegui(aste, { capitale: 150000, mutuo: 40000, prudenza: 'equilibrata' }, { T, stat: STAT, oggi: OGGI, n: 500, seme: 9 });
  assert.equal(ris.piano.scelte.length, 1);
  const e = ris.spiegazione;
  assert.equal(e.disclaimer, 'È una simulazione, non una consulenza finanziaria: le probabilità vengono da esiti passati e da ipotesi tue; verifica sempre avviso e perizia.');
  assert.equal(e.righe[e.righe.length - 1], S.DISCLAIMER);
  const testo = e.righe.join('\n');
  assert.match(testo, /Portale delle Vendite Pubbliche/);
  assert.match(testo, /ipotesi tua/);
  assert.match(testo, /Seconda casa/);
  assert.match(testo, /40\.000 € indicati da te/);
  assert.match(testo, /10%/);
  assert.match(testo, /120 giorni/);
  assert.match(testo, /perizia/);
  assert.match(testo, /prezzo di aggiudicazione/);
  assert.match(testo, /Avvertenza di prova/);
  assert.match(testo, /1 asta in linea con le tue scelte è esclusa/);
  assert.match(S.spiega({}).righe.join('\n'), /non disponibili/);
  assert.equal(S.spiega({}).disclaimer, S.DISCLAIMER);
});

/* ---------- strategia su più anni: proiezione del patrimonio ---------- */

// piano con un'asta sola che si vince sempre (senza statistiche e con concorrenza 1 la probabilità è 1)
function sempreVinta(strategia, x, input) {
  return S.esegui([asta(x || {})], { capitale: 150000, concorrenza: 1, strategia, ...input }, { T, oggi: OGGI, n: 300, seme: 4 });
}

test('proiezione: opzioni con valori predefiniti prudenti e limiti', () => {
  const o = S.opzioniProiezione({});
  assert.deepEqual(o, { anni: 3, rivalutazione: 0, costiAffitto: 0.38, mesiRivendita: 12, costiVendita: 0.04, reinvesti: false, tassoMutuo: null });
  assert.equal(S.opzioniProiezione({}, T).costiAffitto, S.costiAffittoBase(T));
  assert.equal(S.PROIEZIONE_BASE.rivalutazione, 0);
  const l = S.opzioniProiezione({ anni: 9, rivalutazione: 0.5, costiAffitto: 2, mesiRivendita: 0, costiVendita: -1, reinvesti: 'si', tassoMutuo: '0.035' });
  assert.deepEqual(l, { anni: 5, rivalutazione: 0.1, costiAffitto: 0.9, mesiRivendita: 1, costiVendita: 0, reinvesti: true, tassoMutuo: 0.035 });
  assert.equal(S.opzioniProiezione({ anni: 0 }).anni, 1);
  assert.equal(S.opzioniProiezione({ reinvesti: 'no' }).reinvesti, false);
  assert.equal(S.opzioniProiezione({ tassoMutuo: '' }).tassoMutuo, null);
});

test('proiezione: riproducibile, anno per anno, con le stesse aste vinte della simulazione del piano', () => {
  const { prof, cand } = casoRischio('audace');
  const pi = S.piano(cand, prof);
  const ris = { profilo: prof, candidati: cand, piano: pi, simulazione: S.simula(pi, prof, { n: 2000, seme: 21 }), T };
  const a = S.proiezione(ris, { anni: 4 });
  assert.deepEqual(a, S.proiezione(ris, { anni: 4 }));
  assert.notDeepEqual(S.proiezione(ris, { anni: 4, seme: 22 }).serie, a.serie);
  assert.equal(a.n, 2000);
  assert.equal(a.seme, 21);
  assert.equal(a.serie.length, 5);
  assert.deepEqual(a.serie.map((s) => s.anno), [0, 1, 2, 3, 4]);
  assert.deepEqual(a.serie.map((s) => s.data), ['2026-10-13', '2027-10-13', '2028-10-13', '2029-10-13', '2030-10-13']);
  // oggi: solo il capitale in cassa
  assert.deepEqual(a.serie[0].patrimonio, { p10: 100000, p50: 100000, p90: 100000, media: 100000 });
  // a fine anno 1 (prima di qualsiasi vendita) gli immobili posseduti sono le aste vinte della simulazione, giro per giro
  assert.equal(a.serie[1].posseduti, ris.simulazione.vinte.media);
  assert.equal(S.proiezione(ris, { anni: 9 }).serie.length, 6);   // al massimo 5 anni
});

test('proiezione: nessuna rivalutazione se non la chiedi', () => {
  const ris = sempreVinta('vivere');
  const c = ris.piano.scelte[0];
  const p = S.proiezione(ris, { anni: 3 });
  for (const y of [1, 2, 3]) {
    assert.equal(p.serie[y].immobili.p50, 180000);   // il valore minimo della forchetta, fermo
    assert.equal(p.serie[y].patrimonio.p50, 150000 - c.cassaNecessaria + 180000);
  }
  assert.match(p.ipotesi.join('\n'), /senza rivalutazione/);
  // con l'ipotesi esplicita dell'utente il valore cresce dell'x% l'anno
  const r = S.proiezione(ris, { anni: 3, rivalutazione: 0.02 });
  assert.equal(r.serie[3].immobili.p50, Math.round(180000 * Math.pow(1.02, 3)));
  assert.match(r.ipotesi.join('\n'), /rivalutazione del 2% l'anno.*ipotesi tua/);
  // un valore negativo si legge come calo dei prezzi, non come "rivalutazione del -2%"
  const calo = S.proiezione(ris, { anni: 3, rivalutazione: -0.02 });
  assert.equal(calo.serie[3].immobili.p50, Math.round(180000 * Math.pow(0.98, 3)));
  assert.match(calo.ipotesi.join('\n'), /un calo dei prezzi del 2% l'anno/);
});

test('proiezione: affitti dalle quotazioni OMI di locazione, al netto di costi e sfitto', () => {
  // asta il 01/12/2026, saldo entro il 31/03/2027: affitto dal primo mese intero dopo il saldo, 6 mesi nel primo anno
  const ris = sempreVinta('affittare', { omiAffMin: 500, omiAffMax: 700 });
  const p = S.proiezione(ris, { anni: 3 });
  const f1 = p.serie[1].affitti, f3 = p.serie[3].affitti;
  // costi e sfitto predefiniti: 38% del canone, resta il 62%
  assert.ok(f1.p10 >= 6 * 500 * 0.62 && f1.p90 <= 6 * 700 * 0.62, JSON.stringify(f1));
  assert.ok(f3.p10 >= 30 * 500 * 0.62 && f3.p90 <= 30 * 700 * 0.62, JSON.stringify(f3));
  assert.ok(f3.p10 < f3.p50 && f3.p50 < f3.p90);   // un canone diverso per ogni simulazione, tra minimo e massimo OMI
  assert.ok(Math.abs(f3.media - 30 * 600 * 0.62) < 300, String(f3.media));
  assert.equal(p.serie[3].cassa.p50, 150000 - ris.piano.scelte[0].cassaNecessaria + p.serie[3].affitti.p50);
  // senza costi e sfitto i canoni sono quelli lordi
  const lordo = S.proiezione(ris, { anni: 3, costiAffitto: 0 });
  assert.ok(Math.abs(lordo.serie[3].affitti.media - 30 * 600) < 400);
  const testo = p.ipotesi.join('\n');
  assert.match(testo, /quotazioni OMI di locazione/);
  assert.match(testo, /38% del canone.*ipotesi tua/);
  assert.match(testo, /21%/);
  assert.ok(p.fonti.some((x) => /OMI/.test(x.nome) && /agenziaentrate\.gov\.it/.test(x.url)));
  // senza quotazione OMI di locazione nessun affitto, e lo si dice
  const senza = S.proiezione(sempreVinta('affittare'), { anni: 2 });
  assert.equal(senza.serie[2].affitti.p90, 0);
  assert.match(senza.avvertenze.join('\n'), /Per nessuna asta del piano c'è la quotazione OMI di locazione: non stimo nessun affitto/);
  // chi rivende o ci va a vivere non incassa affitti
  assert.equal(S.proiezione(sempreVinta('rivendere', { omiAffMin: 500, omiAffMax: 700 }), { anni: 3 }).serie[3].affitti.p90, 0);
});

test('proiezione: plusvalenza tassata solo se rivendi entro 5 anni', () => {
  const v = S.vendita({ prezzo: 180000, costo: 99700, costiVendita: 0.04, mesiPossesso: 12 }, T);
  assert.equal(v.costi, 7200);
  // per prudenza i costi di vendita non si tolgono dalla plusvalenza (come js/calcoli.js): 180.000 − 99.700
  assert.equal(v.plusvalenza, 80300);
  assert.equal(v.imposta, 20878);
  assert.equal(v.netto, 180000 - 7200 - 20878);
  assert.equal(v.entroCinqueAnni, true);
  assert.equal(S.vendita({ prezzo: 180000, costo: 99700, costiVendita: 0.04, mesiPossesso: 59 }, T).imposta, 20878);
  const dopo = S.vendita({ prezzo: 180000, costo: 99700, costiVendita: 0.04, mesiPossesso: 61 }, T);
  assert.equal(dopo.imposta, 0);
  assert.equal(dopo.entroCinqueAnni, false);
  assert.equal(dopo.netto, 180000 - 7200);
  assert.equal(S.vendita({ prezzo: 180000, costo: 99700, costiVendita: 0.04, mesiPossesso: 12, abitazionePrincipale: true }, T).imposta, 0);
  assert.equal(S.vendita({ prezzo: 90000, costo: 99700, costiVendita: 0.04, mesiPossesso: 12 }, T).imposta, 0);   // in perdita
  assert.equal(S.vendita({ prezzo: 18000, costo: 9000, costiVendita: 0.04, mesiPossesso: 12, immobile: false }, T).imposta, 0);
  // nella proiezione: vendita 12 mesi dopo il saldo (nel secondo anno), con l'imposta sostitutiva
  const ris = sempreVinta('rivendere');
  const c = ris.piano.scelte[0];
  const p = S.proiezione(ris, { anni: 3 });
  const atteso = S.vendita({ prezzo: 180000, costo: c.costoTotale, costiVendita: 0.04, mesiPossesso: 12 }, T);
  assert.equal(p.serie[1].imposte.p50, 0);
  assert.equal(p.serie[1].immobili.p50, 180000);
  assert.equal(p.serie[2].imposte.p50, atteso.imposta);
  assert.equal(p.serie[2].immobili.p50, 0);
  assert.equal(p.serie[2].cassa.p50, Math.round(150000 - c.cassaNecessaria + atteso.netto));
  assert.deepEqual(p.vendite, { media: 1, quotaGiri: 1, quotaConImposta: 1, impostaMedia: atteso.imposta });
  const testo = p.ipotesi.join('\n');
  assert.match(testo, /entro 5 anni/);
  assert.match(testo, /imposta sostitutiva del 26%, che è facoltativa/);
  assert.match(testo, /Art\. 67/);
  // con una rivendita oltre la fine del periodo nessuna vendita e nessuna imposta
  const tardi = S.proiezione(ris, { anni: 2, mesiRivendita: 24 });
  assert.equal(tardi.vendite.media, 0);
  assert.equal(tardi.serie[2].imposte.p90, 0);
  assert.match(tardi.avvertenze.join('\n'), /nessun immobile è ancora venduto/);
  // chi ci va a vivere non vende e non paga plusvalenze
  assert.equal(S.proiezione(sempreVinta('vivere'), { anni: 5 }).vendite.impostaMedia, 0);
});

test('proiezione: la cassa non scende mai sotto zero', () => {
  // capitale tutto impegnato, mutuo con interessi alti e reinvestimento: la cassa resta >= 0 in ogni simulazione e in ogni mese
  const casi = [
    sempreVinta('affittare', { omiAffMin: 100, omiAffMax: 120 }, { capitale: 27700, mutuo: 72000 }),
    sempreVinta('rivendere', {}, { capitale: 99700 }),
    S.esegui([asta({ comune: 'A', dataAsta: '2026-11-03' }), asta({ comune: 'B', dataAsta: '2026-11-20' }), asta({ comune: 'C', dataAsta: '2027-01-15', omiAffMin: 400, omiAffMax: 600 })],
      { capitale: 120000, mutuo: 60000, prudenza: 'audace', strategia: 'affittare' }, { T, stat: STAT, oggi: OGGI, n: 1500, seme: 8 })
  ];
  for (const ris of casi) {
    for (const opz of [{ anni: 5 }, { anni: 5, reinvesti: true, tassoMutuo: 0.2 }, { anni: 5, reinvesti: true, mesiRivendita: 6, costiVendita: 0.3 }]) {
      const p = S.proiezione(ris, opz);
      assert.ok(p.cassaMinima >= 0, JSON.stringify(opz) + ' ' + p.cassaMinima);
      p.serie.forEach((s) => assert.ok(s.cassa.p10 >= 0));
    }
  }
  // mutuo senza tasso: il debito resta per intero e si avverte che gli interessi mancano
  const m = S.proiezione(casi[0], { anni: 2 });
  assert.equal(m.mutuo, true);
  assert.equal(m.serie[2].debito.p50, 72000);
  assert.match(m.avvertenze.join('\n'), /tasso del mutuo/);
  // con il tasso gli interessi pesano sulla cassa o sul debito
  const t = S.proiezione(casi[0], { anni: 2, tassoMutuo: 0.04 });
  assert.ok(t.serie[2].patrimonio.p50 < m.serie[2].patrimonio.p50);
});

test('proiezione: forchetta p10 <= p50 <= p90 in ogni anno', () => {
  const ris = S.esegui([asta({ comune: 'A', dataAsta: '2026-11-03', omiAffMin: 500, omiAffMax: 800 }), asta({ comune: 'B', dataAsta: '2026-12-20', omiAffMin: 450, omiAffMax: 600 })],
    { capitale: 200000, strategia: 'affittare', prudenza: 'equilibrata' }, { T, stat: STAT, oggi: OGGI, n: 1500, seme: 13 });
  for (const opz of [{ anni: 5 }, { anni: 5, reinvesti: true, rivalutazione: 0.01 }, { anni: 3, rivalutazione: -0.02 }]) {
    const p = S.proiezione(ris, opz);
    p.serie.forEach((s) => {
      for (const k of ['patrimonio', 'cassa', 'immobili', 'debito', 'affitti', 'imposte']) assert.ok(s[k].p10 <= s[k].p50 && s[k].p50 <= s[k].p90, k + ' anno ' + s.anno);
    });
    assert.ok(p.finale.patrimonio.p10 < p.finale.patrimonio.p90);   // c'è incertezza: la fascia non è un punto
  }
});

test('proiezione: reinvestimento con le medie del piano, detto come ipotesi', () => {
  const ris = S.esegui([asta({ comune: 'A', dataAsta: '2026-11-03' }), asta({ comune: 'B', dataAsta: '2026-11-20', valoreMin: 250000 })],
    { capitale: 220000, concorrenza: 1, strategia: 'rivendere' }, { T, oggi: OGGI, n: 300, seme: 2 });
  const s = ris.piano.scelte;
  assert.equal(s.length, 2);
  const senza = S.proiezione(ris, { anni: 5 }), con = S.proiezione(ris, { anni: 5, reinvesti: true });
  assert.equal(senza.reinvestimento, null);
  assert.equal(con.reinvestimento.simile.costo, Math.round((s[0].costoTotale + s[1].costoTotale) / 2));
  assert.equal(con.reinvestimento.simile.valore, 215000);
  assert.equal(con.reinvestimento.simile.probabilita, 1);
  assert.equal(con.reinvestimento.simile.passo, 3);   // 2 aste in 6 mesi
  // le due vendite lasciano circa 158.000 € di guadagni: basta per un'altra asta simile da 99.700 €
  assert.ok(con.reinvestimento.media >= 1);
  assert.ok(con.finale.patrimonio.p50 > senza.finale.patrimonio.p50);
  assert.match(con.ipotesi.join('\n'), /medie delle aste del piano.*Non è detto che aste simili ci siano davvero/);
  assert.match(senza.ipotesi.join('\n'), /Nessun reinvestimento/);
  // chi ci va a vivere cerca una sola casa: niente reinvestimento
  const v = S.proiezione(sempreVinta('vivere'), { anni: 5, reinvesti: true });
  assert.equal(v.reinvestimento, null);
  assert.match(v.ipotesi.join('\n'), /una sola casa/);
});

test('proiezione: senza piano il patrimonio resta il capitale; ipotesi, fonti e avviso sempre presenti', () => {
  const vuoto = S.esegui([], { capitale: 50000 }, { T, oggi: OGGI, n: 100 });
  const p = S.proiezione(vuoto, { anni: 2 });
  p.serie.forEach((s) => assert.deepEqual(s.patrimonio, { p10: 50000, p50: 50000, p90: 50000, media: 50000 }));
  assert.match(p.avvertenze.join('\n'), /Nessuna asta nel piano/);
  assert.equal(p.disclaimer, S.DISCLAIMER);
  const q = S.proiezione(sempreVinta('rivendere'), {});
  assert.equal(q.anni, 3);
  assert.match(q.ipotesi.join('\n'), /Forchetta: 300 simulazioni \(seme 4\)/);
  assert.ok(q.fonti.some((x) => /Art\. 67/.test(x.nome) && x.url));
  assert.throws(() => S.proiezione({ piano: { scelte: [] } }, {}), /tariffe/);
});

/* ---------- correzioni del 28/10/2026 alla proiezione ---------- */

test('proiezione: costi e sfitto predefiniti con le stesse ipotesi del calcolatore «Conviene?»', () => {
  // cedolare 21% sugli 11 mesi affittati, 1 mese sfitto, spese 10% del canone → resta il 62,4%: costi 37,6%, arrotondati per eccesso a 38%
  assert.equal(S.costiAffittoBase(T), 0.38);
  assert.equal(S.PROIEZIONE_BASE.costiAffitto, S.costiAffittoBase(T), 'il valore senza tariffe deve restare uguale a quello delle tariffe');
  const c = C.strategie({ offerta: 90000, prezzoBase: 90000, valore: { min: 1, max: 1 }, canoneMese: { min: 1000, max: 1000 } }, T);
  const costiCalcolatore = 1 - c.affitto.nettoAnno.min / 12000;
  assert.ok(S.costiAffittoBase(T) >= costiCalcolatore && S.costiAffittoBase(T) - costiCalcolatore < 0.01, String(costiCalcolatore));
  // senza tariffe resta il valore fisso; un valore scelto dall'utente vince sempre
  assert.equal(S.costiAffittoBase(null), 0.38);
  assert.equal(S.opzioniProiezione({ costiAffitto: 0.2 }, T).costiAffitto, 0.2);
  const p = S.proiezione(sempreVinta('affittare', { omiAffMin: 500, omiAffMax: 700 }), { anni: 2 });
  assert.equal(p.opzioni.costiAffitto, 0.38);
  assert.match(p.ipotesi.join('\n'), /valore proposto, 38%.*cedolare secca del 21%.*1 mese senza inquilino.*10% del canone/);
});

test('proiezione: i costi di vendita non riducono la plusvalenza, come nel calcolatore «Conviene?»', () => {
  const v = S.vendita({ prezzo: 200000, costo: 120000, costiVendita: 0.05, mesiPossesso: 24 }, T);
  assert.equal(v.costi, 10000);
  assert.equal(v.imposta, C.plusvalenza({ prezzoVendita: 200000, costoAcquisto: 120000, costiInerenti: 0, anniPossesso: 2 }, T).imposta);
  assert.equal(v.imposta, 20800);
  assert.equal(v.netto, 200000 - 10000 - 20800);
  const ris = sempreVinta('rivendere');
  assert.match(S.proiezione(ris, { anni: 3 }).ipotesi.join('\n'), /Per prudenza non tolgo i costi di vendita/);
});

test('proiezione: la rivalutazione vale solo per gli immobili, non per veicoli e beni', () => {
  const auto = { categoria: 'auto', tipo: 'Autoveicoli e cicli', prezzoBase: 8000, offertaMinima: 6000, offertaMax: 9000, valoreMin: 14000 };
  const ris = S.esegui([asta(auto)], { capitale: 50000, concorrenza: 1, strategia: 'rivendere', categoria: 'auto' }, { T, oggi: OGGI, n: 200, seme: 4 });
  assert.equal(ris.piano.scelte.length, 1);
  const ferma = S.proiezione(ris, { anni: 1, mesiRivendita: 24, rivalutazione: 0.05 });
  assert.equal(ferma.serie[1].immobili.p50, 14000);   // prima era 14.000 × 1,05^(12/12): un'auto che si rivaluta
  assert.match(ferma.avvertenze.join('\n'), /vale solo per gli immobili/);
  // vendita dopo 12 mesi dal saldo: prezzo di oggi, meno i costi di vendita, senza imposta (non è un immobile)
  const venduta = S.proiezione(ris, { anni: 3, rivalutazione: 0.05 });
  const c = ris.piano.scelte[0];
  assert.equal(venduta.serie[3].cassa.p50, Math.round(50000 - c.cassaNecessaria + 14000 * 0.96));
  assert.equal(venduta.serie[3].imposte.p90, 0);
  // l'immobile invece si rivaluta
  assert.equal(S.proiezione(sempreVinta('vivere'), { anni: 1, rivalutazione: 0.05 }).serie[1].immobili.p50, Math.round(180000 * 1.05));
});

test('proiezione: la simulazione mediana, voce per voce, somma alla mediana del patrimonio', () => {
  const ris = S.esegui([asta({ comune: 'A', dataAsta: '2026-11-03', omiAffMin: 500, omiAffMax: 800 }), asta({ comune: 'B', dataAsta: '2026-12-20', omiAffMin: 450, omiAffMax: 600 })],
    { capitale: 200000, mutuo: 50000, strategia: 'affittare', prudenza: 'equilibrata' }, { T, stat: STAT, oggi: OGGI, n: 1500, seme: 13 });
  const p = S.proiezione(ris, { anni: 4, tassoMutuo: 0.03 });
  p.serie.forEach((s) => {
    assert.equal(s.mediana.cassa + s.mediana.immobili - s.mediana.debito, s.patrimonio.p50, 'anno ' + s.anno);
    assert.ok(s.mediana.cassa >= 0 && s.mediana.affitti >= 0);
  });
  assert.deepEqual(p.serie[0].mediana, { cassa: 200000, immobili: 0, debito: 0, affitti: 0, imposte: 0 });
});

test('proiezione: fonti con il semestre OMI, l\'art. 67 TUIR con link ufficiale e le statistiche del Portale', () => {
  const stat = { ...STAT, recenti: { giorni: 28, fonte: 'Portale delle Vendite Pubbliche – esiti delle vendite dal 31/08/2026 al 27/09/2026', periodo: { dal: '2026-08-31', al: '2026-09-27' }, gruppi: STAT.gruppi, totale: conta(50, 50, 0, 0.5, 0.5, 0.5) } };
  const affitto = S.esegui([asta({ omiAffMin: 500, omiAffMax: 700 })], { capitale: 150000, strategia: 'affittare' }, { T, stat, oggi: OGGI, n: 200, seme: 4 });
  const p = S.proiezione(affitto, { anni: 2, semestreOmi: '2025/2' });
  const omi = p.fonti.find((f) => /OMI di locazione/.test(f.nome));
  assert.match(omi.nome, /semestre 2025\/2/);
  assert.match(omi.url, /^https:\/\/www\.agenziaentrate\.gov\.it\//);
  assert.match(p.ipotesi.join('\n'), /Agenzia delle Entrate – OMI, semestre 2025\/2/);
  const pvp = p.fonti[0];
  assert.match(pvp.nome, /Portale delle Vendite Pubbliche/);
  assert.match(pvp.nome, /dal 31\/08\/2026 al 27\/09\/2026/);
  assert.equal(pvp.url, 'https://pvp.giustizia.it/pvp/');
  assert.equal(pvp.uso, 'probabilità di vincere');
  // senza semestre lo si dice, non lo si inventa
  assert.match(S.proiezione(affitto, { anni: 2 }).fonti.find((f) => /OMI/.test(f.nome)).nome, /semestre non indicato/);
  const r = S.proiezione(S.esegui([asta({})], { capitale: 150000, strategia: 'rivendere' }, { T, stat, oggi: OGGI, n: 200, seme: 4 }), { anni: 2 });
  const art67 = r.fonti.find((f) => /Art\. 67/.test(f.nome));
  assert.equal(art67.url, T.plusvalenza.url);
  assert.match(art67.url, /^https:\/\/www\.agenziaentrate\.gov\.it\//);
});

test('proiezione: quando mancano dati lo dice invece di stimare', () => {
  // affitto senza nessuna quotazione OMI di locazione: nessun canone stimato
  const senza = S.proiezione(sempreVinta('affittare'), { anni: 3 });
  assert.equal(senza.affitto.conQuotazione, 0);
  senza.serie.forEach((s) => assert.equal(s.affitti.p90, 0));
  assert.match(senza.avvertenze.join('\n'), /Per nessuna asta del piano c'è la quotazione OMI di locazione/);
  // senza statistiche degli esiti: probabilità del caso peggiore, detto
  assert.match(senza.avvertenze.join('\n'), /Statistiche sugli esiti passati del Portale non disponibili/);
  assert.equal(S.proiezione(S.esegui([asta({ omiAffMin: 500, omiAffMax: 700 })], { capitale: 150000, strategia: 'affittare' }, { T, stat: STAT, oggi: OGGI, n: 100 }), {}).avvertenze.some((a) => /Statistiche/.test(a)), false);
  // immobile occupato da affittare: l'affitto dal saldo può essere contato per eccesso
  const occ = S.proiezione(sempreVinta('affittare', { omiAffMin: 500, omiAffMax: 700, stato: 'occupato' }), { anni: 3 });
  assert.equal(occ.affitto.occupati, 1);
  assert.match(occ.avvertenze.join('\n'), /1 immobile del piano è occupato.*per eccesso/);
  // mutuo senza tasso: avviso; rate del capitale non simulate, detto
  const m = S.proiezione(sempreVinta('affittare', { omiAffMin: 100, omiAffMax: 120 }, { capitale: 27700, mutuo: 72000 }), { anni: 2 });
  assert.match(m.avvertenze.join('\n'), /Indica il tasso del mutuo/);
  assert.match(m.ipotesi.join('\n'), /Le rate del capitale non sono simulate/);
});

/* ---------- grafico "Il patrimonio nel tempo": dati puri per l'SVG ---------- */

function proiezioneDiProva(opz) {
  const ris = S.esegui([asta({ comune: 'A', dataAsta: '2026-11-03' }), asta({ comune: 'B', dataAsta: '2026-12-20', valoreMin: 160000 })],
    { capitale: 200000, strategia: 'rivendere', prudenza: 'audace' }, { T, stat: STAT, oggi: OGGI, n: 800, seme: 13 });
  return S.proiezione(ris, { anni: 5, reinvesti: true, ...opz });
}

test('grafico: una scala sola da zero, anni da oggi, fascia p10–p90 e linea mediana', () => {
  const p = proiezioneDiProva();
  const d = S.datiGrafico(p, { larghezza: 640, altezza: 300 });
  assert.equal(d.vuoto, false);
  assert.equal(d.compatto, false);
  assert.equal(d.punti.length, 6);
  assert.deepEqual(d.asseX.map((a) => a.testo), ['oggi', '1 anno', '2 anni', '3 anni', '4 anni', '5 anni']);
  // x crescenti ed equidistanti, dentro il piano del grafico
  const xs = d.punti.map((q) => q.x);
  assert.equal(xs[0], d.piano.x0);
  assert.equal(xs[5], d.piano.x1);
  for (let i = 1; i < xs.length; i++) assert.ok(Math.abs((xs[i] - xs[i - 1]) - (xs[1] - xs[0])) < 0.2);
  // scala: parte da zero, passo tondo, sopra il caso alto più alto; y del valore più alto più in alto
  assert.equal(d.scala.min, 0);
  assert.equal(d.scala.tacche[0].valore, 0);
  assert.equal(d.scala.tacche[0].y, d.piano.y1);
  assert.equal(d.scala.tacche[d.scala.tacche.length - 1].y, d.piano.y0);
  assert.ok(d.scala.max >= Math.max(...p.serie.map((s) => s.patrimonio.p90)));
  assert.ok([1, 2, 2.5, 5].includes(d.scala.passo / Math.pow(10, Math.floor(Math.log10(d.scala.passo)))));
  d.punti.forEach((q, i) => {
    const s = p.serie[i].patrimonio;
    assert.deepEqual([q.p10, q.p50, q.p90], [s.p10, s.p50, s.p90]);
    assert.ok(q.y90 <= q.y50 && q.y50 <= q.y10, 'anno ' + i);
    assert.ok(q.y90 >= d.piano.y0 && q.y10 <= d.piano.y1);
    assert.equal(q.mediana.cassa + q.mediana.immobili - q.mediana.debito, q.p50);
  });
  // linea: un punto per anno; fascia: sopra lungo p90 e ritorno lungo p10, chiusa
  assert.equal((d.linea.match(/[ML]/g) || []).length, 6);
  assert.ok(d.linea.startsWith('M' + d.punti[0].x + ' ' + d.punti[0].y50));
  assert.equal((d.area.match(/[ML]/g) || []).length, 12);
  assert.ok(d.area.endsWith('Z'));
  assert.ok(d.area.includes('L' + d.punti[5].x + ' ' + d.punti[5].y10));
  // zone del mouse e del tocco: contigue, senza buchi, una per anno
  for (let i = 1; i < d.punti.length; i++) {
    const z0 = d.punti[i - 1].zona, z1 = d.punti[i].zona;
    assert.ok(Math.abs(z0.x + z0.larghezza - z1.x) < 0.2);
  }
  assert.equal(S.puntoVicino(d, d.punti[2].x + 3), 2);
  assert.equal(S.puntoVicino(d, -100), 0);
  assert.equal(S.puntoVicino(d, 9999), 5);
});

test('grafico: etichette dirette sui valori finali, senza sovrapporsi e dentro il riquadro', () => {
  const p = proiezioneDiProva();
  for (const larghezza of [640, 340]) {
    const d = S.datiGrafico(p, { larghezza });
    const u = d.punti[d.punti.length - 1];
    const e = d.etichette;
    assert.ok(e.length >= 1 && e.length <= 3);
    assert.ok(e.some((x) => /mediana|tutte/.test(x.nome)));
    // spazio di un'etichetta: 17 px per il valore e 13 px per ogni riga del nome
    for (let i = 1; i < e.length; i++) assert.ok(e[i].c - e[i - 1].c >= 17 + 13 * e[i - 1].righe.length - 0.01, 'etichette sovrapposte a ' + larghezza + ' px');
    e.forEach((x) => {
      assert.ok(x.c >= 10 && x.c + 4 + 13 * x.righe.length <= d.altezza - 4);
      assert.equal(x.nome, x.righe.join(' '));
      // il testo più lungo entra nel margine destro (stima: 6,6 px a carattere per il valore, 5,7 per il nome)
      assert.ok(12 + Math.max(x.testo.length * 6.6, ...x.righe.map((r) => r.length * 5.7)) <= d.margini.destra, x.testo);
      assert.equal(x.guida, Math.abs(x.c - x.y) > 3);
      assert.equal(x.valore, u[x.chiave]);
    });
  }
  // valori molto vicini: le etichette si allontanano e hanno la linea guida
  const vicini = S.datiGrafico({ aste: 1, n: 10, capitale: 1000, serie: [
    { anno: 0, data: '2026-10-13', patrimonio: { p10: 1000, p50: 1000, p90: 1000 } },
    { anno: 1, data: '2027-10-13', patrimonio: { p10: 100000, p50: 100500, p90: 101000 } }] }, { larghezza: 600 });
  assert.equal(vicini.etichette.length, 3);
  assert.ok(vicini.etichette.some((x) => x.guida));
  for (let i = 1; i < 3; i++) assert.ok(vicini.etichette[i].c - vicini.etichette[i - 1].c >= 29.99);
  // su telefono i nomi doppi vanno su due righe
  const corto = S.datiGrafico({ aste: 1, n: 10, capitale: 50000, serie: [
    { anno: 0, data: '2026-10-13', patrimonio: { p10: 50000, p50: 50000, p90: 50000 } },
    { anno: 1, data: '2027-10-13', patrimonio: { p10: 50000, p50: 50000, p90: 170617 } }] }, { larghezza: 316 });
  assert.deepEqual(corto.etichette.map((x) => x.righe), [['caso alto'], ['mediana e', 'caso basso']]);
  assert.ok(corto.margini.destra <= 100 && corto.piano.x1 - corto.piano.x0 >= 150, JSON.stringify(corto.margini));
  // le tacche dell'asse entrano nel margine sinistro
  corto.scala.tacche.forEach((t) => assert.ok(t.testo.length * 5.7 + 8 <= corto.margini.sinistra, t.testo));
  // valori uguali: un'etichetta sola, senza dire "caso alto" e "caso basso" per lo stesso numero
  const uguali = S.datiGrafico({ aste: 1, n: 10, capitale: 50000, serie: [
    { anno: 0, data: '2026-10-13', patrimonio: { p10: 50000, p50: 50000, p90: 50000 } },
    { anno: 1, data: '2027-10-13', patrimonio: { p10: 70000, p50: 70000, p90: 70000 } }] }, { larghezza: 600 });
  assert.deepEqual(uguali.etichette.map((x) => x.nome), ['tutte le simulazioni']);
  assert.match(uguali.riassunto, /uguale in tutte le simulazioni/);
  const dueUguali = S.datiGrafico({ aste: 1, n: 10, capitale: 50000, serie: [
    { anno: 0, data: '2026-10-13', patrimonio: { p10: 50000, p50: 50000, p90: 50000 } },
    { anno: 1, data: '2027-10-13', patrimonio: { p10: 40000, p50: 70000, p90: 70000 } }] }, { larghezza: 600 });
  assert.deepEqual(dueUguali.etichette.map((x) => x.nome), ['mediana e caso alto', 'caso basso']);
});

test('grafico: su telefono forma compatta, numeri brevi e testo alternativo con il riassunto', () => {
  const p = proiezioneDiProva();
  const d = S.datiGrafico(p, { larghezza: 340 });
  assert.equal(d.compatto, true);
  assert.equal(d.larghezza, 340);
  assert.deepEqual(d.asseX.map((a) => a.testo), ['oggi', '1', '2', '3', '4', '5']);
  assert.equal(d.nomeAsse, 'anni');
  assert.ok(d.piano.x1 - d.piano.x0 >= 180, 'resta spazio per il grafico');
  d.etichette.forEach((x) => assert.match(x.testo, /^[−\d][\d,]* (mila |mln )?€$/));
  d.scala.tacche.forEach((t) => assert.ok(t.testo.length <= 11, t.testo));
  assert.match(d.scala.tacche[d.scala.tacche.length - 1].testo, / €$/);   // l'unità sulla tacca più alta
  assert.doesNotMatch(d.scala.tacche[0].testo, /€/);
  // riassunto: oggi, valori finali con il caso basso e alto, mediana di ogni anno
  const u = p.finale.patrimonio;
  assert.match(d.riassunto, /^Patrimonio stimato nei prossimi 5 anni, in 800 simulazioni\. Oggi: 200\.000 €\./);
  assert.ok(d.riassunto.includes('mediana ' + Math.round(u.p50).toLocaleString('it-IT') + ' €'));
  assert.ok(d.riassunto.includes('caso basso ' + u.p10.toLocaleString('it-IT') + ' €'));
  assert.match(d.riassunto, /8 simulazioni su 10 stanno tra i due/);
  assert.match(d.riassunto, /Mediana a fine anno: 1° .*, 5° /);
  // larghezza minima garantita
  assert.equal(S.datiGrafico(p, { larghezza: 100 }).larghezza, 280);
  assert.match(S.datiGrafico(proiezioneDiProva({ anni: 1 })).riassunto, /^Patrimonio stimato nel prossimo anno,/);
});

test('grafico: numeri brevi, valori negativi e piano vuoto', () => {
  assert.equal(S.eurBreve(950), '950');
  assert.equal(S.eurBreve(12500), '12,5 mila');
  assert.equal(S.eurBreve(250000), '250 mila');
  assert.equal(S.eurBreve(1250000), '1,25 mln');
  assert.equal(S.eurBreve(999600), '1 mln');
  assert.equal(S.eurBreve(-20000), '−20 mila');
  // patrimonio sotto zero: la scala scende sotto zero e lo zero resta una tacca
  const neg = S.datiGrafico({ aste: 1, n: 10, capitale: 10000, serie: [
    { anno: 0, data: '2026-10-13', patrimonio: { p10: 10000, p50: 10000, p90: 10000 } },
    { anno: 1, data: '2027-10-13', patrimonio: { p10: -15000, p50: 5000, p90: 20000 } }] }, { larghezza: 600 });
  assert.ok(neg.scala.min <= -15000);
  assert.ok(neg.scala.tacche.some((t) => t.valore === 0 && t.testo === '0'));
  assert.ok(neg.punti[1].y10 <= neg.piano.y1);
  // nessuna asta nel piano: niente grafico, e lo si dice
  const vuoto = S.datiGrafico(S.proiezione(S.esegui([], { capitale: 50000 }, { T, oggi: OGGI, n: 50 }), { anni: 2 }), { larghezza: 600 });
  assert.equal(vuoto.vuoto, true);
  assert.equal(vuoto.riassunto, 'Nessuna asta nel piano: il patrimonio resta il capitale in cassa, 50.000 €.');
  assert.equal(S.datiGrafico(null).vuoto, true);
});

test('pagina: campi su più anni con valori prudenti e aiuto, sezione del patrimonio e avviso', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'stratega.html'), 'utf8');
  const campo = (nome) => {
    const m = html.match(new RegExp('<(?:input|select)[^>]*name="' + nome + '"[^>]*>'));
    assert.ok(m, 'manca il campo ' + nome);
    const aiuto = (m[0].match(/aria-describedby="([^"]+)"/) || [])[1];
    assert.ok(aiuto && html.includes('id="' + aiuto + '"'), 'manca l\'aiuto del campo ' + nome);
    return m[0];
  };
  assert.match(html, /<select[^>]*name="anni"[\s\S]*?<option value="1">[\s\S]*?<option value="5">/);
  assert.match(html, /<option value="3" selected>/);
  assert.match(campo('rivalutazione'), /value="0"/);
  assert.match(campo('costiAffitto'), /value="38"/);
  assert.match(campo('mesiRivendita'), /value="12"/);
  assert.match(campo('costiVendita'), /value="4"/);
  assert.doesNotMatch(campo('reinvesti'), /checked/);
  campo('tassoMutuo');
  campo('anni');
  assert.match(html, /simulazione, non una consulenza finanziaria/i);
  // la sezione è disegnata dalla pagina: titolo, avviso ben visibile, grafico SVG accessibile e tabella dei numeri
  const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'pages', 'stratega.js'), 'utf8');
  assert.match(js, /<h2 id="h-patrimonio">Il patrimonio nel tempo<\/h2>/);
  assert.match(js, /callout warn pt-avviso"><b>Simulazione, non consulenza finanziaria\.<\/b>/);
  assert.match(js, /role="img" aria-labelledby="ptTit ptDesc"/);
  assert.match(js, /<summary>I numeri del grafico<\/summary>/);
  assert.match(js, /S\.datiGrafico\(/);
});
