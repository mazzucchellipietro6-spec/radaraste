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
