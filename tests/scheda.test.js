const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SD = require('../js/scheda-dati.js');
const Stratega = require('../js/stratega.js');
const Omi = require('../js/omi.js');

const RADICE = path.join(__dirname, '..');
const ADESSO = '2026-10-19T10:00'; // data e ora di Roma usate nei test
const NBSP = ' ';

/* ---------- schede vere (data/dettagli/, raccolta del 12-13/10/2026): solo i campi che servono alla scheda ---------- */

const OMI_FONTE = 'Agenzia delle Entrate – OMI, semestre 2025/2 (CC BY 4.0)';
// Scansano (GR): un tentativo deserto e una vendita sospesa, zona OMI riconosciuta, nota sulla superficie netta
const SCANSANO = {
  id: 'pvp-4633063', titolo: 'Appartamento sito al piano primo e si sviluppa su un unico livello con pianta rettangolare, ha una superficie…',
  categoria: 'immobile', tipo: 'Immobile residenziale', regione: 'Toscana', provincia: 'GR', comune: 'Scansano',
  indirizzo: 'Via Provinciale Grossetana, 58054 Pancole GR, Italia', tribunale: 'Grosseto', rge: '25', fonte: 'Portale Vendite Pubbliche',
  prezzoBase: 36000, offertaMinima: 27000, dataAsta: '2026-12-02', ora: '14:00', stato: 'nd',
  linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=4633063', pubblicata: '2026-09-18', vista: '2026-10-12',
  tentativo: 2, deserte: 1, primoPrezzo: 45000, ribasso: 0.2, storico: [['2026-05-06', 45000, 'deserta'], ['2026-07-14', 36000, 'sospesa']],
  superficieMq: 45, valore: 28125, fonteValore: 'omi', affidabilita: 'bassa',
  omi: {
    fonte: OMI_FONTE, semestre: '2025/2', comune: 'SCANSANO',
    zona: { link: 'GR00001849', fascia: 'E', codice: 'E6', descrizione: 'PANCOLE E MONTORGIALI', metodo: 'indirizzo' },
    tipologia: 'Abitazioni civili', stato: 'normale', euroMq: { min: 500, max: 750 }, affittoMq: { min: 2.8, max: 3.5, superficie: 'lorda' }, mq: 45,
    affidabilita: 'media',
    note: ['L\'avviso indica la superficie netta: le quotazioni OMI sono sulla superficie lorda, quindi il valore può essere più alto'],
    compravendite: { ntn: 94.99, taglia: 'S' }
  }
};
// Avigliano (PZ): 3° tentativo, esiti dei tentativi precedenti non pubblicati
const AVIGLIANO = {
  id: 'pvp-4634455', titolo: 'Piena proprietà quota 1/1 di fabbricato per civile abitazione nel Comune di Avigliano (PZ), frazione di…',
  categoria: 'immobile', tipo: 'Immobile residenziale', regione: 'Basilicata', provincia: 'PZ', comune: 'Avigliano',
  indirizzo: 'V. Umberto I, 85021 Lagopesole PZ, Italia', tribunale: 'Potenza', rge: '110', fonte: 'Portale Vendite Pubbliche',
  prezzoBase: 60252.13, offertaMinima: 45190, dataAsta: '2026-11-26', ora: '12:00', stato: 'occupato',
  linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=4634455', pubblicata: '2026-09-22', vista: '2026-10-12',
  tentativo: 3, deserte: 2, primoPrezzo: 80336.17, ribasso: 0.25, storico: [['2024-12-03', 80336.17, null], ['2026-09-15', 80336.17, null]],
  superficieMq: 160, valore: 112000, fonteValore: 'omi', affidabilita: 'alta',
  omi: {
    fonte: OMI_FONTE, semestre: '2025/2', comune: 'AVIGLIANO',
    zona: { link: 'PZ00001733', fascia: 'E', codice: 'E1', descrizione: 'FRAZIONI URBANE - LAGOPESOLE - POSSIDENTE', metodo: 'indirizzo' },
    tipologia: 'Abitazioni civili', stato: 'normale', euroMq: { min: 620, max: 780 }, affittoMq: { min: 1.9, max: 2.7, superficie: 'lorda' }, mq: 160,
    affidabilita: 'media', compravendite: { ntn: 43.7, taglia: 'S' }
  }
};
// Melilli (SR): termine per le offerte letto dal dettaglio dell'avviso
const MELILLI = {
  id: 'pvp-4644889', titolo: 'Piena proprietà di garage di mq. 19, facente parte della Palazzina P3, interno 9. Il bene risulta libero.',
  categoria: 'immobile', tipo: 'Immobile commerciale', regione: 'Sicilia', provincia: 'SR', comune: 'Melilli',
  indirizzo: 'frazione Villasmundo, Via delle Orchidee, 17', tribunale: 'Catania', rge: '1/2007', fonte: 'Portale Vendite Pubbliche',
  prezzoBase: 4500, offertaMinima: 3375, dataAsta: '2026-12-11', ora: '11:00', stato: 'nd',
  linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=4644889', pubblicata: '2026-10-13', vista: '2026-10-13',
  tentativo: 2, deserte: 1, primoPrezzo: 6000, ribasso: 0.25, storico: [['2026-06-25', 6000, 'deserta']], termineOfferte: '2026-12-10T13:00',
  superficieMq: 19, valore: 6840, fonteValore: 'omi', affidabilita: 'alta',
  omi: {
    fonte: OMI_FONTE, semestre: '2025/2', comune: 'MELILLI',
    zona: { link: 'SR00000226', fascia: 'E', codice: 'E1', descrizione: 'VILLASMUNDO', metodo: 'indirizzo' },
    tipologia: 'Box', stato: 'normale', euroMq: { min: 290, max: 430 }, affittoMq: { min: 1.3, max: 1.9, superficie: 'lorda' }, mq: 19,
    affidabilita: 'media', compravendite: { ntn: 133.3, taglia: 'S' }
  }
};
// Santa Croce Camerina (RG): tentativo non noto, catena non collegata, zona OMI non riconosciuta e superficie mancante
const SANTA_CROCE = {
  id: 'pvp-4615552', titolo: 'Unità immobiliare adibita ad uffici e ½ della proprietà indivisa del sottotetto.',
  categoria: 'immobile', tipo: 'Immobile commerciale', regione: 'Sicilia', provincia: 'RG', comune: 'Santa Croce Camerina',
  indirizzo: 'Via Cirillo, 4, 97017 Santa Croce Camerina RG, Italia', tribunale: 'Ragusa', rge: '11', fonte: 'Portale Vendite Pubbliche',
  prezzoBase: 95723, offertaMinima: 95723, dataAsta: '2026-10-16', ora: '10:00', stato: 'nd',
  linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=4615552', pubblicata: '2026-07-27', vista: '2026-10-12',
  storicoNota: 'Tentativi precedenti non collegati: indirizzo diverso.',
  omi: {
    fonte: OMI_FONTE, semestre: '2025/2', comune: 'SANTA CROCE CAMERINA', zona: null, tipologia: 'Uffici', stato: 'normale',
    euroMq: { min: 600, max: 845 }, affittoMq: { min: 2.95, max: 4.25, superficie: 'lorda' },
    note: ['Zona OMI non riconosciuta dall\'indirizzo: valori tipici del comune (mediana di 2 zone)'],
    mancante: 'metri quadri non indicati nell\'avviso'
  }
};
// San Nicandro Garganico (FG): terreno, tipologia non quotata dall'OMI
const TERRENO = {
  id: 'pvp-4594671', titolo: 'Piena proprietà (1000/1000) di un TERRENO a nord del centro abitato di San Nicandro Garganico, di complessivi…',
  categoria: 'immobile', tipo: 'Altra categoria', regione: 'Puglia', provincia: 'FG', comune: 'San Nicandro Garganico',
  fonte: 'Portale Vendite Pubbliche', prezzoBase: 30375, offertaMinima: 22781.25, dataAsta: '2026-10-15', ora: '17:00', stato: 'occupato',
  pubblicata: '2026-06-15', tentativo: 2, deserte: 1, primoPrezzo: 40500, ribasso: 0.25, storico: [['2026-06-11', 40500, 'deserta']], superficieMq: 1539,
  omi: { comune: 'SANNICANDRO GARGANICO', mancante: 'tipologia non quotata dall\'OMI (es. terreni)' }
};
// Fano (PU): vendita dell'Agenzia del Demanio (prezzo e apertura delle offerte solo nel PDF)
const DEMANIO = {
  id: 'dem-Avviso-di-vendita-di-un-bene-immobile-sito-nel-Comune-di-Fano', titolo: 'Avviso di vendita di un bene immobile sito nel Comune di Fano',
  categoria: 'immobile', tipo: 'Pubblicità rinnovo - formalizzazione utilizzo', regione: 'Marche', provincia: 'PU', comune: 'Fano',
  fonte: 'Agenzia del Demanio', dataAsta: '2026-10-15', ora: '12:00', stato: 'nd',
  linkAvviso: 'https://www.agenziademanio.it/it/gare-aste/immobiliare/gara/Avviso-di-vendita-di-un-bene-immobile-sito-nel-Comune-di-Fano',
  pubblicata: '2026-09-15', vista: '2026-10-12', omi: { mancante: 'comune non trovato nelle quotazioni OMI' }
};
// Ceprano (FR): rimorchio al primo tentativo
const RIMORCHIO = {
  id: 'pvp-4626903', titolo: 'Rimorchio PimaPer visionare la documentazione disponibile, si invitano le parti interessate a visitare la…',
  categoria: 'auto', tipo: 'Autoveicoli e cicli', regione: 'Lazio', provincia: 'FR', comune: 'Ceprano', tribunale: 'Frosinone', rge: '19',
  fonte: 'Portale Vendite Pubbliche', prezzoBase: 675, offertaMinima: 675, dataAsta: '2026-10-16', ora: '12:00', stato: 'nd',
  pubblicata: '2026-09-07', vista: '2026-10-12', tentativo: 1, valore: 675, fonteValore: 'prima-asta', affidabilita: 'bassa'
};
// Ravanusa (AG): 4° tentativo con tre tentativi precedenti nello storico
const RAVANUSA = {
  id: 'pvp-4642328', categoria: 'immobile', tipo: 'Altra categoria', provincia: 'AG', comune: 'Ravanusa', fonte: 'Portale Vendite Pubbliche',
  prezzoBase: 12671, offertaMinima: 9503.25, dataAsta: '2026-12-22', ora: '16:00', pubblicata: '2026-10-07', tentativo: 4, deserte: 3,
  primoPrezzo: 40046, ribasso: 0.437, storico: [['2024-02-15', 40046, null], ['2024-06-19', 30035, null], ['2025-01-09', 22526, null]]
};

/* ---------- estratto vero di data/statistiche.js (calcolato il 13/10/2026) ---------- */

const c = (aggiudicate, deserte, ignote, p, pMin, pMax) => ({ aggiudicate, deserte, ignote, n: aggiudicate + deserte + ignote, p, pMin, pMax });
const RECENTI = {
  giorni: 28, periodo: { dal: '2026-08-31', al: '2026-09-27' },
  fonte: 'Portale delle Vendite Pubbliche – esiti delle vendite dal 31/08/2026 al 27/09/2026',
  gruppi: {
    residenziale: { ...c(482, 1051, 1775, 0.314, 0.146, 0.682), tentativi: { 1: c(295, 505, 820, 0.369, 0.182, 0.688), 2: c(152, 458, 711, 0.249, 0.115, 0.653), 3: c(6, 11, 57, null, 0.081, 0.851), '4+': c(1, 1, 35, null, 0.027, 0.973) } },
    'altri-immobili': { ...c(374, 1040, 1607, 0.264, 0.124, 0.656), tentativi: { 1: c(226, 453, 547, 0.333, 0.184, 0.631), 2: c(119, 465, 715, 0.204, 0.092, 0.642), 3: c(9, 32, 75, 0.22, 0.078, 0.724), '4+': c(0, 4, 34, null, 0, 0.895) } },
    veicoli: { ...c(117, 326, 553, 0.264, 0.117, 0.673), tentativi: { 1: c(58, 136, 188, 0.299, 0.152, 0.644), 2: c(17, 57, 132, 0.23, 0.083, 0.723), 3: c(15, 28, 69, 0.349, 0.134, 0.75), '4+': c(1, 12, 13, null, 0.038, 0.538) } },
    beni: { ...c(414, 1267, 1589, 0.246, 0.127, 0.613), tentativi: { 1: c(140, 372, 479, 0.273, 0.141, 0.625), 2: c(67, 357, 259, 0.158, 0.098, 0.477), 3: c(56, 160, 121, 0.259, 0.166, 0.525), '4+': c(21, 55, 36, 0.276, 0.188, 0.509) } }
  },
  totale: { ...c(1387, 3684, 5524, 0.274, 0.131, 0.652), tentativi: {} }
};
const STAT = {
  versione: 1, calcolato: '2026-10-13', fonte: 'Portale delle Vendite Pubbliche – esiti delle vendite dal 13/10/2023 al 27/09/2026',
  url: 'https://pvp.giustizia.it/ric-496b258c-986a1b71/ric-ms/ricerca/vendite', periodo: { dal: '2023-10-13', al: '2026-09-27' }, minimoCampione: 30,
  avvertenze: ['Il prezzo di aggiudicazione non è pubblicato: si misura solo se qualcuno ha offerto, non quanto.'],
  nomi: { residenziale: 'immobili residenziali', 'altri-immobili': 'altri immobili (commerciali, industriali, terreni e altro)', veicoli: 'veicoli e nautica', beni: 'altri beni mobili' },
  gruppi: {
    residenziale: { ...c(580, 17233, 30981, 0.033, 0.012, 0.647), tentativi: { 1: c(366, 13045, 21729, 0.027, 0.01, 0.629), 2: c(171, 3104, 5343, 0.052, 0.02, 0.64), 3: c(9, 432, 1481, 0.02, 0.005, 0.775), '4+': c(1, 83, 353, 0.012, 0.002, 0.81) } },
    'altri-immobili': { ...c(483, 19880, 28175, 0.024, 0.01, 0.59), tentativi: { 1: c(310, 14196, 17621, 0.021, 0.01, 0.558), 2: c(135, 3888, 5428, 0.034, 0.014, 0.589), 3: c(10, 820, 1753, 0.012, 0.004, 0.683), '4+': c(0, 261, 699, 0, 0, 0.728) } }
  },
  totale: { ...c(1667, 53500, 87540, 0.03, 0.012, 0.625), tentativi: {} },
  recenti: RECENTI
};

const chiavi = (lt) => lt.eventi.map((e) => e.chiave);
const evento = (lt, k) => lt.eventi.find((e) => e.chiave === k);
const vicino = (x, y) => assert.ok(Math.abs(x - y) < 0.0011, x + ' ≠ ' + y);

/* ---------- linea del tempo ---------- */

test('linea del tempo: tentativi dallo storico, sospesa, pubblicazione, termine, asta e saldo stimato in ordine', () => {
  const lt = SD.lineaTempo(SCANSANO, { adesso: ADESSO });
  assert.deepEqual(chiavi(lt), ['tentativo', 'sospesa', 'pubblicazione', 'termine', 'asta', 'saldo']);
  const t1 = lt.eventi[0];
  assert.equal(t1.titolo, '1° tentativo');
  assert.equal(t1.data, '2026-05-06');
  assert.equal(t1.nota, 'Prezzo base 45.000' + NBSP + '€ · andata deserta');
  assert.equal(t1.esito, 'deserta');
  const sosp = lt.eventi[1];
  assert.equal(sosp.titolo, 'Vendita sospesa');
  assert.match(sosp.nota, /non conta come tentativo/);
  assert.equal(evento(lt, 'pubblicazione').nota, 'Sul Portale delle Vendite Pubbliche');
  // termine non indicato: senza data, subito prima dell'asta, con la regola tipica da verificare
  const ter = evento(lt, 'termine');
  assert.equal(ter.data, null);
  assert.equal(ter.stato, 'senza-data');
  assert.match(ter.nota, /Non indicato nei dati raccolti.*verifica nell'avviso/);
  const asta = evento(lt, 'asta');
  assert.equal(asta.titolo, '2° tentativo: questa asta');
  assert.equal(asta.data, '2026-12-02');
  assert.equal(asta.ora, '14:00');
  assert.equal(asta.qui, true);
  assert.equal(asta.nota, 'Prezzo base 36.000' + NBSP + '€ (−20% rispetto al tentativo precedente) · offerta minima 27.000' + NBSP + '€');
  // saldo: 120 giorni dopo l'asta, segnato come stima
  const saldo = evento(lt, 'saldo');
  assert.equal(saldo.data, '2027-04-01');
  assert.equal(saldo.stima, true);
  assert.equal(saldo.titolo, 'Saldo del prezzo (stima)');
  assert.match(saldo.nota, /Di solito entro 120 giorni.*verifica l'avviso/);
  // cosa è già avvenuto il 19/10/2026
  assert.deepEqual(lt.eventi.map((e) => e.stato), ['fatto', 'fatto', 'fatto', 'senza-data', 'prossimo', 'futuro']);
  assert.deepEqual(lt.note, ['Dalla prima asta (45.000' + NBSP + '€) il prezzo base è sceso del 20%.']);
});

test('linea del tempo: esiti non pubblicati e numerazione dei tentativi', () => {
  const lt = SD.lineaTempo(AVIGLIANO, { adesso: ADESSO });
  assert.deepEqual(chiavi(lt), ['tentativo', 'tentativo', 'pubblicazione', 'termine', 'asta', 'saldo']);
  assert.deepEqual(lt.eventi.slice(0, 2).map((e) => e.titolo), ['1° tentativo', '2° tentativo']);
  // il lotto è tornato in vendita: l'esito non è pubblicato, ma non è "ancora da venire"
  assert.match(lt.eventi[0].nota, /^Prezzo base 80\.336 € · esito non pubblicato; il lotto è poi tornato in vendita$/);
  // stesso prezzo del tentativo prima: nessun ribasso indicato
  assert.doesNotMatch(lt.eventi[1].nota, /−/);
  assert.equal(evento(lt, 'asta').titolo, '3° tentativo: questa asta');
  assert.match(evento(lt, 'asta').nota, /\(−25% rispetto al tentativo precedente\)/);
  assert.equal(evento(lt, 'saldo').data, '2027-03-26');
  assert.deepEqual(lt.note, ['Dalla prima asta (80.336' + NBSP + '€) il prezzo base è sceso del 25%.']);
  // senza "adesso" nulla risulta già avvenuto: il primo evento con la data è il prossimo
  const senza = SD.lineaTempo(AVIGLIANO);
  assert.equal(senza.eventi[0].stato, 'prossimo');
  assert.ok(senza.eventi.every((e) => e.stato !== 'fatto'));
});

test('linea del tempo: termine per le offerte letto dall\'avviso, prima dell\'asta, e stato secondo l\'ora', () => {
  const lt = SD.lineaTempo(MELILLI, { adesso: ADESSO });
  assert.deepEqual(chiavi(lt), ['tentativo', 'pubblicazione', 'termine', 'asta', 'saldo']);
  const ter = evento(lt, 'termine');
  assert.equal(ter.data, '2026-12-10');
  assert.equal(ter.ora, '13:00');
  assert.equal(ter.stato, 'prossimo');
  assert.match(ter.nota, /Offerta e cauzione/);
  // un'ora dopo il termine: il termine è passato, l'asta è la prossima
  const dopo = SD.lineaTempo(MELILLI, { adesso: '2026-12-10T14:00' });
  assert.equal(evento(dopo, 'termine').stato, 'fatto');
  assert.equal(evento(dopo, 'asta').stato, 'prossimo');
  // alle 12:59 il termine non è ancora passato
  assert.equal(evento(SD.lineaTempo(MELILLI, { adesso: '2026-12-10T12:59' }), 'termine').stato, 'prossimo');
});

test('linea del tempo: ribasso rispetto alla raccolta precedente (prezzoPrecedente, dataRibasso)', () => {
  // i dati di oggi non hanno ribassi rilevati: stessa scheda vera con i due campi che la raccolta aggiunge quando il prezzo scende
  const a = { ...AVIGLIANO, prezzoPrecedente: 80336.17, dataRibasso: '2026-09-22' };
  const lt = SD.lineaTempo(a, { adesso: ADESSO });
  const rib = evento(lt, 'ribasso');
  assert.ok(rib, 'evento del ribasso');
  assert.equal(rib.data, '2026-09-22');
  assert.equal(rib.titolo, 'Prezzo base ribassato');
  assert.equal(rib.nota, 'Da 80.336' + NBSP + '€ a 60.252' + NBSP + '€ (−25%): rilevato dalla raccolta di quel giorno');
  assert.equal(rib.stato, 'fatto');
  // in ordine di data: dopo il 2° tentativo (15/09), insieme alla pubblicazione (22/09)
  assert.deepEqual(chiavi(lt).slice(0, 4), ['tentativo', 'tentativo', 'pubblicazione', 'ribasso']);
  // prezzo precedente più basso o senza data: nessun ribasso
  assert.equal(evento(SD.lineaTempo({ ...AVIGLIANO, prezzoPrecedente: 50000, dataRibasso: '2026-09-22' }), 'ribasso'), undefined);
  assert.equal(evento(SD.lineaTempo({ ...AVIGLIANO, prezzoPrecedente: 80336.17 }), 'ribasso'), undefined);
});

test('linea del tempo: storico incompleto, catena non collegata, primo tentativo', () => {
  // 4° tentativo con tre tentativi nello storico: completo
  const r = SD.lineaTempo(RAVANUSA, { adesso: ADESSO });
  assert.deepEqual(r.eventi.filter((e) => e.chiave === 'tentativo').map((e) => e.titolo), ['1° tentativo', '2° tentativo', '3° tentativo']);
  assert.match(r.eventi[1].nota, /^Prezzo base 30\.035 € \(−25%\)/);
  assert.ok(!r.note.some((t) => /nello storico/.test(t)));
  // se il primo manca (lo storico conserva gli ultimi 10) la numerazione resta quella vera e lo si dice
  const corto = SD.lineaTempo({ ...RAVANUSA, storico: RAVANUSA.storico.slice(1) }, { adesso: ADESSO });
  assert.deepEqual(corto.eventi.filter((e) => e.chiave === 'tentativo').map((e) => e.titolo), ['2° tentativo', '3° tentativo']);
  assert.ok(corto.note.includes('Il primo tentativo non è nello storico: qui ci sono solo gli ultimi.'));
  // tentativo non noto, catena non collegata: si dice perché, senza la frase generica
  const sc = SD.lineaTempo(SANTA_CROCE, { adesso: ADESSO });
  assert.equal(evento(sc, 'asta').titolo, 'Questa asta');
  assert.deepEqual(sc.note, ['Tentativi precedenti non collegati: indirizzo diverso.']);
  assert.equal(evento(sc, 'asta').stato, 'fatto'); // asta del 16/10/2026, già passata il 19/10
  // primo tentativo di un veicolo: niente saldo stimato (la stima dei 120 giorni vale per gli immobili)
  const ri = SD.lineaTempo(RIMORCHIO, { adesso: ADESSO });
  assert.deepEqual(ri.note, ['È il primo tentativo di vendita trovato nello storico del portale.']);
  assert.equal(evento(ri, 'asta').titolo, '1° tentativo: questa asta');
  assert.equal(evento(ri, 'saldo').data, null);
  assert.match(evento(ri, 'saldo').nota, /indicato nell'avviso/);
});

test('linea del tempo: Agenzia del Demanio (termine per le offerte, nessuna data d\'asta inventata)', () => {
  const lt = SD.lineaTempo(DEMANIO, { adesso: ADESSO });
  assert.deepEqual(chiavi(lt), ['pubblicazione', 'termine', 'saldo']);
  assert.equal(evento(lt, 'pubblicazione').nota, 'Sul sito dell\'Agenzia del Demanio');
  const ter = evento(lt, 'termine');
  assert.equal(ter.data, '2026-10-15');
  assert.equal(ter.ora, '12:00');
  assert.equal(ter.qui, true);
  assert.match(ter.nota, /avviso PDF/);
  assert.equal(evento(lt, 'saldo').data, null);
  assert.deepEqual(lt.note, []);
});

/* ---------- la zona ---------- */

test('zona: OMI con codice, fascia spiegata, prezzi, affitto, superficie, NTN con la taglia, fonte e note', () => {
  const z = SD.zona(SCANSANO);
  assert.equal(z.immobile, true);
  const o = z.omi;
  assert.equal(o.fonte, OMI_FONTE);
  assert.equal(o.semestre, '2025/2');
  assert.equal(o.comune, 'Scansano');
  assert.deepEqual(o.zona, {
    codice: 'E6', fascia: 'E', nomeFascia: Omi.FASCE.E, spiegaFascia: SD.FASCE_SEMPLICI.E, descrizione: 'Pancole e Montorgiali', metodo: 'indirizzo',
    comeTrovata: 'riconosciuta confrontando l\'indirizzo dell\'avviso con la descrizione ufficiale della zona'
  });
  assert.equal(o.zona.nomeFascia, 'suburbana');
  assert.match(o.zona.spiegaFascia, /fuori dal centro abitato/);
  assert.equal(o.senzaZona, null);
  assert.equal(o.tipologia, 'Abitazioni civili');
  assert.equal(o.stato, 'normale');
  assert.deepEqual(o.euroMq, { min: 500, max: 750 });
  assert.deepEqual(o.affittoMq, { min: 2.8, max: 3.5, superficie: 'lorda' });
  assert.equal(o.mq, 45);
  assert.deepEqual(o.valore, { min: 22500, max: 33750 });
  assert.deepEqual(o.affitto, { min: 126, max: 158 });
  assert.deepEqual(o.note, [SCANSANO.omi.note[0]]);
  assert.equal(o.compravendite.ntn, 94.99);
  assert.equal(o.compravendite.taglia, 'S');
  assert.equal(o.compravendite.testo, 'In un anno a Scansano sono state registrate circa 95 compravendite di abitazioni (NTN 94,99): mercato di taglia S.');
  assert.equal(z.sintesi, 'Zona OMI E6 (fascia E, suburbana) – Pancole e Montorgiali: abitazioni civili 500–750' + NBSP + '€/m², affitto 2,8–3,5' + NBSP + '€/m² al mese.');
  // spiegazioni in parole semplici: tutte le fasce e l'NTN
  for (const f of ['B centrale', 'C semicentrale', 'D periferica', 'E suburbana', 'R extraurbana']) assert.ok(z.spiegazioni.fasce.includes(f), f);
  assert.match(z.spiegazioni.ntn, /numero di transazioni normalizzate/);
  assert.match(z.spiegazioni.taglia, /S, M, L, XL, XXL/);
  assert.match(z.spiegazioni.omi, /Agenzia delle Entrate/);
  // nessuna perizia della zona nei dati: lo si dice
  assert.equal(z.perizie, null);
  assert.deepEqual(z.mancanti, ['Confronto con le perizie della zona: non disponibile (servono almeno 5 perizie con stima e superficie nello stesso comune o provincia).']);
  // collegamento alla mappa con il filtro del comune (js/pages/mappa.js legge ?filtri=)
  assert.deepEqual(z.mappa, { comune: 'Scansano', provincia: 'GR' });
  // ogni fascia OMI ha la sua spiegazione
  for (const f of Object.keys(Omi.FASCE)) assert.ok(SD.FASCE_SEMPLICI[f], 'fascia ' + f);
});

test('zona: valori tipici del comune, superficie mancante, OMI non quotata, non immobili', () => {
  const sc = SD.zona(SANTA_CROCE);
  assert.equal(sc.omi.zona, null);
  assert.match(sc.omi.senzaZona, /Zona OMI non riconosciuta dall'indirizzo/);
  assert.deepEqual(sc.omi.note, [], 'la nota sulla zona non riconosciuta è già in senzaZona');
  assert.equal(sc.omi.mq, null);
  assert.equal(sc.omi.valore, undefined);
  assert.equal(sc.omi.mancante, 'metri quadri non indicati nell\'avviso');
  assert.ok(sc.mancanti.includes('Compravendite del comune (NTN): non disponibili per questa asta (arrivano con la superficie).'));
  assert.match(sc.sintesi, /^Valori tipici del comune \(zona OMI non riconosciuta\): uffici 600–845/);
  // tipologia non quotata (terreni): nessun valore OMI, e lo si dice
  const t = SD.zona(TERRENO);
  assert.equal(t.omi, null);
  assert.equal(t.mancanti[0], 'Quotazioni OMI della zona: tipologia non quotata dall\'OMI (es. terreni).');
  assert.deepEqual(t.mappa, { comune: 'San Nicandro Garganico', provincia: 'FG' });
  // comune non trovato (Demanio, Fano)
  assert.equal(SD.zona(DEMANIO).mancanti[0], 'Quotazioni OMI della zona: comune non trovato nelle quotazioni OMI.');
  // scheda senza il campo omi
  const { omi, ...senza } = AVIGLIANO;
  assert.equal(SD.zona(senza).mancanti[0], 'Quotazioni OMI della zona: non ancora collegate a questa asta.');
  // veicolo: la zona OMI non si applica
  const v = SD.zona(RIMORCHIO);
  assert.equal(v.immobile, false);
  assert.deepEqual(v.mancanti, ['Le quotazioni OMI riguardano solo gli immobili.']);
});

test('zona: mediana delle perizie della zona (campo zona del punteggio, js/punteggio.js)', () => {
  // i dati di oggi non hanno ancora 5 perizie per comune: forma del campo zona di Punteggio.valore con valori di prova
  const a = { ...AVIGLIANO, valore: 112000, superficieMq: 160, zona: { livello: 'comune', nome: 'Avigliano', mediana: 640, n: 6, rapporto: 1.09 } };
  const z = SD.zona(a);
  assert.deepEqual({ livello: z.perizie.livello, mediana: z.perizie.mediana, n: z.perizie.n, questa: z.perizie.questa }, { livello: 'comune', mediana: 640, n: 6, questa: 700 });
  assert.equal(z.perizie.testo, 'Mediana delle stime dei periti per le abitazioni all\'asta nel comune di Avigliano: 640' + NBSP + '€/m² su 6 perizie; questa asta: 700' + NBSP + '€/m² (1,09 volte la mediana).');
  assert.ok(!z.mancanti.some((m) => /perizie della zona/.test(m)));
  const p = SD.zona({ ...a, zona: { livello: 'provincia', nome: 'PZ', mediana: 600, n: 12, rapporto: null } });
  assert.match(p.perizie.testo, /nella provincia di PZ: 600 €\/m² su 12 perizie; questa asta: 700 €\/m²\.$/);
});

/* ---------- probabilità ---------- */

test('probabilità: aste simili per gruppo e tentativo, ultimi esiti noti, forchetta, fonte e campione', () => {
  const p = SD.probabilita(SCANSANO, STAT, 0.3);
  assert.equal(p.disponibile, true);
  assert.equal(p.gruppo, Stratega.gruppoDi(SCANSANO));
  assert.equal(p.gruppo, 'residenziale');
  assert.equal(p.livello, 'tentativo');
  assert.equal(p.testoSimili, 'Aste simili (immobili residenziali, 2° tentativo) hanno trovato un acquirente nel 24,9% dei casi negli ultimi esiti noti (forchetta 11,5–65,3%).');
  assert.equal(p.testoIpotesi, 'Se offri e ci sono altri offerenti, vinci con la probabilità che scegli tu: 30% (ipotesi tua, non un dato).');
  // P(vincere) = P(nessun altro) + P(altri) × ipotesi, come js/stratega.js
  vicino(p.vincere, (1 - 0.249) + 0.249 * 0.3);
  vicino(p.intervallo[0], (1 - 0.653) + 0.653 * 0.3);
  vicino(p.intervallo[1], (1 - 0.115) + 0.115 * 0.3);
  assert.deepEqual(p.campione, { noti: 610, ignote: 711, n: 1321 });
  assert.equal(p.testoCampione, '610 vendite con esito noto dal 31/08/2026 al 27/09/2026, più 711 senza esito (contate nella forchetta).');
  assert.equal(p.fonte, RECENTI.fonte + ' (calcolate il 13/10/2026)');
  assert.equal(p.url, STAT.url);
  assert.deepEqual(p.periodo, { dal: '2026-08-31', al: '2026-09-27' });
  assert.match(p.testoStima, /^È una stima dai dati passati/);
  assert.match(p.spiegazione, /non una previsione/);
  assert.match(p.spiegazione, /ultime 4 settimane/);
  assert.deepEqual(p.avvertenze, STAT.avvertenze);
  assert.equal(p.perche, '');
  // stessi numeri dello Stratega
  const s = Stratega.probabilita(SCANSANO, STAT, { concorrenza: 0.3 });
  assert.equal(p.vincere, s.vincere);
  assert.deepEqual(p.intervallo, s.intervallo);
});

test('probabilità: l\'ipotesi dell\'utente cambia P(vincere), non la quota di aste con altri offerenti', () => {
  const zero = SD.probabilita(SCANSANO, STAT, 0), meta = SD.probabilita(SCANSANO, STAT, 0.5), tutto = SD.probabilita(SCANSANO, STAT, 1);
  assert.equal(zero.testoSimili, meta.testoSimili);
  vicino(zero.vincere, 1 - 0.249);
  vicino(meta.vincere, (1 - 0.249) + 0.249 * 0.5);
  assert.equal(tutto.vincere, 1);
  assert.match(meta.testoIpotesi, /: 50% \(ipotesi tua, non un dato\)\.$/);
  // fuori scala: riportata tra 0 e 1
  assert.equal(SD.probabilita(SCANSANO, STAT, 1.7).concorrenza, 1);
  assert.equal(SD.probabilita(SCANSANO, STAT, -0.2).concorrenza, 0);
  // senza ipotesi: il valore predefinito dello Stratega
  assert.equal(SD.probabilita(SCANSANO, STAT).concorrenza, Stratega.PROFILO_BASE.concorrenza);
});

test('probabilità: pochi esiti al tentativo → tutto il gruppo; tentativo non noto; veicoli', () => {
  const p = SD.probabilita(AVIGLIANO, STAT, 0.3);
  assert.equal(p.livello, 'gruppo');
  assert.equal(p.testoSimili, 'Aste simili (immobili residenziali, tutti i tentativi) hanno trovato un acquirente nel 31,4% dei casi negli ultimi esiti noti (forchetta 14,6–68,2%).');
  assert.equal(p.perche, 'Al 3° tentativo gli esiti noti sono meno di 30: uso tutto il gruppo.');
  const sc = SD.probabilita(SANTA_CROCE, STAT, 0.3);
  assert.equal(sc.gruppo, 'altri-immobili');
  assert.equal(sc.livello, 'gruppo');
  assert.match(sc.testoSimili, /^Aste simili \(immobili non residenziali, tutti i tentativi\) hanno trovato un acquirente nel 26,4%/);
  assert.equal(sc.perche, 'Numero del tentativo non noto: uso tutto il gruppo.');
  const v = SD.probabilita(RIMORCHIO, STAT, 0.3);
  assert.equal(v.gruppo, 'veicoli');
  assert.equal(v.testoSimili, 'Aste simili (veicoli e nautica, 1° tentativo) hanno trovato un acquirente nel 29,9% dei casi negli ultimi esiti noti (forchetta 15,2–64,4%).');
});

test('probabilità: senza il blocco recente usa l\'intero periodo e lo dice', () => {
  const { recenti, ...vecchie } = STAT;
  const p = SD.probabilita(SCANSANO, vecchie, 0.3);
  assert.equal(p.recenti, false);
  assert.equal(p.testoSimili, 'Aste simili (immobili residenziali, 2° tentativo) hanno trovato un acquirente nel 5,2% dei casi negli esiti noti (forchetta 2–64%).');
  assert.equal(p.fonte, STAT.fonte + ' (calcolate il 13/10/2026)');
  // il separatore delle migliaia per i numeri di 4 cifre dipende dalla versione di ICU (3275 o 3.275)
  assert.match(p.testoCampione, /^3\.?275 vendite con esito noto dal 13\/10\/2023 al 27\/09\/2026, più 5\.?343 senza esito/);
  assert.doesNotMatch(p.spiegazione, /settimane/);
});

test('probabilità: statistiche mancanti o insufficienti, vendite del Demanio → non disponibile, e lo si dice', () => {
  const senza = SD.probabilita(SCANSANO, null, 0.3);
  assert.equal(senza.disponibile, false);
  assert.match(senza.motivo, /non disponibili.*non lo inventiamo/);
  assert.match(senza.testoIpotesi, /30%/);
  const vuote = SD.probabilita(SCANSANO, { fonte: 'x', gruppi: {}, totale: c(0, 0, 0, null, null, null) }, 0.3);
  assert.equal(vuote.disponibile, false);
  assert.match(vuote.motivo, /almeno 30/);
  const dem = SD.probabilita(DEMANIO, STAT, 0.3);
  assert.equal(dem.disponibile, false);
  assert.match(dem.motivo, /Agenzia del Demanio/);
});

/* ---------- pagina: script, stampa, sintassi per il browser ---------- */

test('scheda.html carica statistiche, mutuo e Stratega dopo il punteggio, e i moduli della scheda prima della pagina', () => {
  const html = fs.readFileSync(path.join(RADICE, 'scheda.html'), 'utf8');
  const script = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const i = (f) => { const n = script.indexOf(f); assert.ok(n >= 0, f + ' non è caricato'); return n; };
  assert.ok(i('js/punteggio.js') < i('data/statistiche.js'));
  assert.ok(i('data/statistiche.js') < i('js/stratega.js'));
  assert.ok(i('js/calcoli.js') < i('js/stratega.js'));
  assert.ok(i('js/mutuo.js') < i('js/stratega.js'));
  for (const f of ['js/stratega.js', 'js/omi.js', 'js/asta.js', 'js/scheda-dati.js']) assert.ok(i(f) < i('js/pages/scheda.js'), f);
  assert.equal(script[script.length - 1], 'js/pages/scheda.js');
});

test('report da stampare: pulsante, foglio @media print A4 senza menu, pulsanti, mappa e foto', () => {
  const js = fs.readFileSync(path.join(RADICE, 'js/pages/scheda.js'), 'utf8');
  assert.match(js, /Stampa o salva in PDF/);
  assert.match(js, /window\.print\(\)/);
  assert.match(js, /beforeprint/);
  // contenuti del report
  for (const t of ['Prezzo base', 'Valore di mercato', 'Affidabilità', 'Costo totale', 'Offerta massima consigliata', 'Date e scadenze', 'Rischi cercati', 'Documenti', 'Stampata il', 'Avvertenza']) assert.ok(js.includes(t), t);
  const css = fs.readFileSync(path.join(RADICE, 'assets/css/pagine.css'), 'utf8');
  const stampa = css.slice(css.indexOf('/* ---------- scheda: versione da stampare'));
  assert.match(stampa, /@page \{ size: A4;/);
  assert.match(stampa, /body\.sc-con-stampa > :not\(main\)/);
  assert.match(stampa, /#scheda > :not\(\.sc-stampa\)/);
  assert.match(stampa, /\.sc-stampa \{ display: block;/);
  // sullo schermo il report non si vede
  assert.match(css, /^\.sc-stampa \{ display: none; \}$/m);
});

test('file per il browser in sintassi ES5 (niente arrow function, template literal, let o const)', () => {
  for (const f of ['js/scheda-dati.js', 'js/pages/scheda.js']) {
    // senza commenti e stringhe tra apici singoli
    const t = fs.readFileSync(path.join(RADICE, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\\n])*'/g, "''");
    assert.doesNotMatch(t, /=>/, f + ': arrow function');
    assert.doesNotMatch(t, /`/, f + ': template literal');
    assert.doesNotMatch(t, /\b(let|const)\s/, f + ': let o const');
  }
});
