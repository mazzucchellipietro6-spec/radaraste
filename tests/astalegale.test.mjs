import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOME, leggiPayload, risultatiRicerca, dataOra, importo, categoria, tribunale, procedura, breve,
  converti, inOrdineDecrescente, urlRicerca
} from '../scripts/fonti/astalegale.mjs';

// Annuncio di esempio scritto a mano, con la stessa forma dell'elenco del sito.
const annuncio = (extra = {}) => ({
  id: 'B1234567',
  friendlyId: 'B1234567-Abitazione-di-tipo-civile-Via-Roma-10-Prato',
  genere: 'Immobili',
  tipologia: 'Abitazione di tipo civile',
  titolo: 'Via Roma 10, 59100 Prato PO, Italia',
  comune: 'Prato',
  provincia: 'Prato',
  regione: 'Toscana',
  tribunale: 'Prato',
  proceduraNumeroAnno: '412/2024',
  tipoProcedura: 'E.C.',
  ambito: 'VenditaGiudiziaria',
  prezzo: '€ 40.500,00',
  prezzoNum: 40500,
  offertaMinima: '30.375,00',
  dataAsta: '16/12/2026 - 10:30',
  posizione: { lat: 43.8777049, lng: 11.1022302 },
  descrizione: 'Appartamento al piano primo di mq 85. Info: avv. Rossi tel. 0574 123456, email rossi@studio.it',
  externalDetailUrl: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=4641887',
  isPro: false,
  ...extra
});

test('lettura del blocco __NUXT_DATA__ (formato appiattito con indici)', () => {
  const piatto = [
    ['ShallowReactive', 1],
    { data: 2 },
    ['ShallowReactive', 3],
    { '/webapi/Search_it_0_POST_abc': 4 },
    { results: 5 },
    { currentPage: 6, pageIndex: 9, pageSize: 10, totalResults: 11 },
    [7],
    { id: 8, prezzoNum: 10 },
    'B1',
    1,
    48,
    9006
  ];
  const html = `<html><script type="application/json" data-ssr="true" id="__NUXT_DATA__">${JSON.stringify(piatto)}</script></html>`;
  const r = risultatiRicerca(leggiPayload(html));
  assert.deepEqual(r, { annunci: [{ id: 'B1', prezzoNum: 48 }], totale: 9006, pagina: 1, dimensione: 48 });
  assert.equal(leggiPayload('<html>niente</html>'), null);
  assert.equal(risultatiRicerca({ data: { altro: {} } }), null);
});

test('data e ora; dati oscurati', () => {
  assert.deepEqual(dataOra('16/12/2026 - 10:30'), { data: '2026-12-16', ora: '10:30' });
  assert.deepEqual(dataOra('1/2/2027 - 9:05'), { data: '2027-02-01', ora: '09:05' });
  assert.equal(dataOra('XX/XX/XXXX - XX:XX'), null);
  assert.equal(dataOra(''), null);
});

test('importi in formato italiano', () => {
  assert.equal(importo('€ 114.609,38'), 114609.38);
  assert.equal(importo('40.500,00'), 40500);
  assert.equal(importo(152812.5), 152812.5);
  assert.equal(importo('-'), null);
  assert.equal(importo(0), null);
  assert.equal(importo(undefined), null);
});

test('categoria dal genere e dalla tipologia', () => {
  assert.equal(categoria({ genere: 'Immobili', tipologia: 'Terreno' }), 'immobile');
  assert.equal(categoria({ genere: 'Mobili', tipologia: 'Autovetture' }), 'auto');
  assert.equal(categoria({ genere: 'Mobili', tipologia: 'Automezzi commerciali' }), 'auto');
  assert.equal(categoria({ genere: 'Mobili', tipologia: 'Motocicli' }), 'moto');
  assert.equal(categoria({ genere: 'Mobili', tipologia: 'Mobili da casa e varie' }), 'beni');
  assert.equal(categoria({ genere: 'Azienda', tipologia: 'Azienda' }), 'beni');
  assert.equal(categoria({ genere: 'Altro', tipologia: 'Terreno' }), 'immobile');
  assert.equal(categoria({ genere: 'Crediti', tipologia: 'Titoli' }), 'beni');
});

test('tribunale e numero di procedura', () => {
  assert.equal(tribunale('Prato'), 'Prato');
  assert.equal(tribunale('Tribunale di PRATO'), 'Prato');
  assert.equal(tribunale('TRIBUNALE ORDINARIO Enna'), 'Enna');
  assert.equal(tribunale('Barcellona Pozzo di Gotto'), 'Barcellona Pozzo di Gotto');
  assert.equal(tribunale('Pavia (ex Voghera)'), 'Pavia');
  assert.equal(tribunale('Bolzano - Bozen'), 'Bolzano');
  assert.equal(tribunale("L'Aquila"), "L'Aquila");
  assert.equal(tribunale(null), '');
  assert.equal(procedura('412/2024'), '412/2024');
  assert.equal(procedura(' 4 / 2026 '), '4/2026');
  assert.equal(procedura('XXX/XXXX'), '');
  assert.equal(procedura(null), '');
});

test('descrizione breve senza e-mail e telefoni', () => {
  const d = breve('Appartamento di mq 85, prezzo 40.500. Tel. 0574 123456 o 335 6090700, pec a@b.it');
  assert.ok(!/0574|6090700|@/.test(d), d);
  assert.ok(d.includes('40.500'));
  assert.ok(breve('x '.repeat(300)).length <= 200);
});

test('conversione di un immobile', () => {
  const a = converti(annuncio());
  assert.equal(a.id, 'al-B1234567');
  assert.equal(a.fonte, NOME);
  assert.equal(a.titolo, 'Abitazione di tipo civile – Prato');
  assert.equal(a.categoria, 'immobile');
  assert.equal(a.tipo, 'Abitazione di tipo civile');
  assert.equal(a.provincia, 'PO');
  assert.equal(a.regione, 'Toscana');
  assert.equal(a.comune, 'Prato');
  assert.equal(a.indirizzo, 'Via Roma 10, 59100 Prato PO');
  assert.equal(a.tribunale, 'Prato');
  assert.equal(a.rge, '412/2024');
  assert.equal(a.prezzoBase, 40500);
  assert.equal(a.offertaMinima, 30375);
  assert.equal(a.dataAsta, '2026-12-16');
  assert.equal(a.ora, '10:30');
  assert.equal(a.stato, 'nd');
  assert.equal(a.linkAvviso, 'https://www.astalegale.net/Aste/Detail/B1234567-Abitazione-di-tipo-civile-Via-Roma-10-Prato');
  assert.equal(a.lat, 43.8777);
  assert.equal(a.lng, 11.10223);
  assert.equal(a.idPvp, '4641887');
  assert.ok(!/rossi@|123456/.test(a.descrizione));
});

test('conversione di un bene mobile e casi senza dati', () => {
  const a = converti(annuncio({
    id: 'S1051288', friendlyId: 'S1051288-Autovetture-Opel-ASTRA-GTC', genere: 'Mobili', tipologia: 'Autovetture',
    titolo: 'Opel ASTRA GTC', comune: 'Enna', provincia: 'Enna', tribunale: 'Enna', proceduraNumeroAnno: '121/2024',
    prezzo: '€ 2.187,00', prezzoNum: 2187, offertaMinima: '-', dataAsta: '14/10/2026 - 16:30',
    externalDetailUrl: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=', descrizione: null
  }));
  assert.equal(a.titolo, 'Opel ASTRA GTC');
  assert.equal(a.categoria, 'auto');
  assert.equal(a.indirizzo, '');
  assert.equal(a.provincia, 'EN');
  assert.equal(a.offertaMinima, null);
  assert.equal(a.idPvp, null);
  assert.equal(a.descrizione, '');
  // lotto mobiliare pubblicato da Astalegale (codice B…): il "titolo" del sito è l'indirizzo
  const c = converti(annuncio({ id: 'B2431861', genere: 'Mobili', tipologia: 'Autovetture', titolo: 'Via omissis', comune: 'Chieri', provincia: 'Torino' }));
  assert.equal(c.titolo, 'Autovetture – Chieri');
  assert.equal(c.indirizzo, '');
  assert.equal(c.categoria, 'auto');
  // annuncio senza prezzo e senza tribunale: campi vuoti, nessun valore inventato
  const b = converti(annuncio({ prezzo: '-', prezzoNum: undefined, tribunale: null, proceduraNumeroAnno: null }));
  assert.equal(b.prezzoBase, null);
  assert.equal(b.tribunale, '');
  assert.equal(b.rge, '');
  // riservato agli abbonati (dati oscurati) o senza data: scartato
  assert.equal(converti(annuncio({ isPro: true })), null);
  assert.equal(converti(annuncio({ dataAsta: 'XX/XX/XXXX - XX:XX' })), null);
});

test('ordine delle date e indirizzo di ricerca', () => {
  assert.equal(inOrdineDecrescente(['2027-01-02', '2026-12-16', '2026-12-16', '2026-10-01']), true);
  assert.equal(inOrdineDecrescente(['2026-10-01', '2026-12-16']), false);
  const u = new URL(urlRicerca('/immobili', 3));
  assert.equal(u.searchParams.get('sitoEsterno'), 'false');
  assert.equal(u.searchParams.get('limit'), '48');
  assert.equal(u.searchParams.get('sort'), 'DataAstaDesc');
  assert.equal(u.searchParams.get('page'), '3');
  assert.ok(!/hash=/.test(u.search)); // robots.txt vieta gli URL con "hash="
});
