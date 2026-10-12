import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOME, SEZIONI, decodifica, dataOra, numero, tribunaleProcedura, luogoDaTesto, pulisciTitolo, categoriaVeicolo,
  estraiSchede, totaleRisultati, urlRicerca, converti
} from '../scripts/fonti/fallco.mjs';

// Piccoli esempi scritti a mano con la stessa struttura delle schede dell'elenco di ricerca.
const scheda = ({ id, url, inizio, termine, avviso = false, prezzo = 'Prezzo base €: 74.480,00', titolo, modalita = 'Asincrona telematica', trib = '', descr = '', presso = '' }) => `
<article
  class="hover-block auction horizontal-auction fallcoaste${avviso ? ' is-avviso' : ''}"
  data-auction="true"
  data-auction-url="${url.replace(/:/g, '&#x3A;').replace(/\//g, '&#x2F;')}"
  data-auction-id="${id}"
  data-auction-data-inizio="${inizio}"
  data-auction-data-termine="${termine}">
  <div class="figure-container"><a href="${url}" class="single-photo" title="${titolo}"></a>
  ${presso ? `<div class="ribbon"><span>In vendita presso:</span>\n<a href="${url}" class="colored-link">\n  ${presso}\n</a></div>` : ''}
  </div>
  <div class="infos price_date"><span  class="price-block"
     title="${prezzo}"><div class="label-desc">${prezzo.split(':')[0]}:</div><strong>${prezzo.split(':')[1]}</strong></span></div>
  <div class="infos col-sm-pull-6 col-sm-12 col-xs-24 name_type">
    <a href="${url}" title="${titolo}"><h3 class="overflow-hidden">${titolo.slice(0, 20)}...</h3>
    <p title="${modalita}">
      ${modalita}
    </p>
    ${trib ? `<p>${trib}\n   </p>` : ''}
    <div class="visible-md-block visible-lg-block">${descr}</div>
    </a>
  </div>
</article>`;

const PAGINA = `<span class="total-results"><strong>3432</strong> Risultati</span>
${scheda({ id: '1001', url: 'https://www.fallcoaste.it/vendita/appartamento-1001.html', inizio: '13/10/2026 09:00', termine: '13/10/2026 09:00', titolo: 'Lotto: Appartamento con garage', modalita: 'Sincrona mista', trib: 'Tribunale di Arezzo                - Procedura n.55/2025', descr: '<p>Appartamento sito in Cortona (AR), piano primo...</p>' })}
${scheda({ id: '1002', url: 'https://www.fallcoaste.it/avviso-vendita/magazzino-1002.html', inizio: '20/10/2026 10:00', termine: '20/10/2026 10:00', avviso: true, prezzo: 'Prezzo base €: 11.730,00', titolo: 'Magazzino di 27 mq', modalita: 'Pubblicità', trib: 'Tribunale di Napoli Nord - Procedura n.132/2021' })}
${scheda({ id: '1003', url: 'https://ivgbrescia.fallcoaste.it/vendita/motocicletta-1003.html', inizio: '12/09/2026 17:00', termine: '14/10/2026 16:30', prezzo: 'Miglior offerta €: 1.650,00', titolo: 'MOTOCICLETTA BMW R850RT ANNO 2004', presso: 'I.V.G. BRESCIA', descr: '<ul><li>Motocicletta;</li><li>Libretto</li></ul>' })}
${scheda({ id: '1004', url: 'https://www.fallcoaste.it/vendita/vecchia-1004.html', inizio: '01/09/2026 10:00', termine: '10/10/2026 10:00', titolo: 'Asta già chiusa', trib: 'Tribunale di Lucca - Procedura n.1/2026' })}
<script>$('<div></div>').setup_pagination({
      total_elements: 3432,
      per_page      : 15
    });</script>`;

test('entità HTML, date e importi', () => {
  assert.equal(decodifica('https&#x3A;&#x2F;&#x2F;www.fallcoaste.it'), 'https://www.fallcoaste.it');
  assert.equal(decodifica('propriet&agrave; &amp; quota di &#189;'), 'proprietà & quota di ½');
  assert.deepEqual(dataOra('12/10/2026 10:00'), { data: '2026-10-12', ora: '10:00', gma: '12/10/2026' });
  assert.deepEqual(dataOra('1/2/2027'), { data: '2027-02-01', ora: '', gma: '01/02/2027' });
  assert.equal(dataOra(''), null);
  assert.equal(numero('11.730,00'), 11730);
  assert.equal(numero('8.200.000,00'), 8200000);
  assert.equal(numero('96.019,80'), 96019.8);
  assert.equal(numero(''), null);
});

test('tribunale e numero di procedura', () => {
  assert.deepEqual(tribunaleProcedura('Tribunale di Cosenza                - Procedura n.132/2021'), { tribunale: 'Cosenza', rge: '132/2021' });
  assert.deepEqual(tribunaleProcedura('Tribunale di Santa Maria Capua Vetere - Procedura n.69/2025'), { tribunale: 'Santa Maria Capua Vetere', rge: '69/2025' });
  assert.deepEqual(tribunaleProcedura("Tribunale di L'Aquila - Procedura n.7/2024"), { tribunale: "L'Aquila", rge: '7/2024' });
  assert.deepEqual(tribunaleProcedura('Tribunale di Alessandria - ex Tortona - Procedura n.12/2019'), { tribunale: 'Alessandria', rge: '12/2019' });
  assert.deepEqual(tribunaleProcedura('Tribunale di Camera di Commercio - Procedura n.3/2026'), { tribunale: '', rge: '3/2026' });
  assert.deepEqual(tribunaleProcedura(''), { tribunale: '', rge: '' });
});

test('luogo citato nel testo', () => {
  assert.deepEqual(luogoDaTesto('Piena proprietà di immobile sito in Cutrofiano (LE) destinato ad abitazione'), { sigla: 'LE', comune: 'Cutrofiano' });
  assert.deepEqual(luogoDaTesto('abitazione ubicata nel Comune di Isola del Giglio (GR), località Giglio'), { sigla: 'GR', comune: 'Isola del Giglio' });
  assert.deepEqual(luogoDaTesto('quote della società con sede legale (MI)'), { sigla: 'MI', comune: '' });
  assert.deepEqual(luogoDaTesto('SITA IN VIA ROMA 12, MILANO (MI)'), { sigla: 'MI', comune: '' }); // nessun comune "indovinato"
  assert.deepEqual(luogoDaTesto('GRU (XX) MARCATA CE'), { sigla: '', comune: '' });
});

test('titolo ripulito', () => {
  assert.equal(pulisciTitolo('Lotto: Appartamento. Consistenza 6 Vani'), 'Appartamento. Consistenza 6 Vani');
  assert.equal(pulisciTitolo('LOTTO UNICO – Cessione ramo d’azienda'), 'Cessione ramo d’azienda');
  assert.equal(pulisciTitolo('Bene N° 1 - Appartamento ubicato a Deruta'), 'Appartamento ubicato a Deruta');
  assert.equal(pulisciTitolo('Lotto edificabile in zona industriale'), 'Lotto edificabile in zona industriale');
  assert.ok(pulisciTitolo('x'.repeat(200)).length <= 111);
});

test('lettura delle schede di una pagina di ricerca', () => {
  assert.equal(totaleRisultati(PAGINA), 3432);
  assert.equal(totaleRisultati('<strong>6</strong> Risultati'), 6);
  assert.equal(totaleRisultati('<html></html>'), null);
  const s = estraiSchede(PAGINA);
  assert.equal(s.length, 4);
  assert.equal(s[0].id, '1001');
  assert.equal(s[0].url, 'https://www.fallcoaste.it/vendita/appartamento-1001.html');
  assert.equal(s[0].titolo, 'Lotto: Appartamento con garage');
  assert.equal(s[0].modalita, 'Sincrona mista');
  assert.match(s[0].tribunale, /^Tribunale di Arezzo\s+- Procedura n\.55\/2025$/);
  assert.equal(s[0].etichettaPrezzo, 'Prezzo base');
  assert.equal(s[0].prezzo, '74.480,00');
  assert.equal(s[1].avviso, true);
  assert.equal(s[2].etichettaPrezzo, 'Miglior offerta');
  assert.equal(s[2].tribunale, '');
  assert.equal(s[2].presso, 'I.V.G. BRESCIA');
  assert.equal(s[2].testo, 'Motocicletta; Libretto');
});

test('conversione in asta: vendita giudiziaria telematica', () => {
  const [x] = estraiSchede(PAGINA);
  const a = converti(x, SEZIONI[0], '2026-10-12');
  assert.equal(a.id, 'fallco-1001');
  assert.equal(a.fonte, NOME);
  assert.equal(a.titolo, 'Appartamento con garage');
  assert.equal(a.categoria, 'immobile');
  assert.equal(a.tipo, 'Immobile · sincrona mista');
  assert.equal(a.tribunale, 'Arezzo');
  assert.equal(a.rge, '55/2025');
  assert.equal(a.provincia, 'AR');
  assert.equal(a.regione, 'Toscana');
  assert.equal(a.comune, 'Cortona');
  assert.equal(a.prezzoBase, 74480);
  assert.equal(a.offertaMinima, null);
  assert.equal(a.dataAsta, '2026-10-13');
  assert.equal(a.ora, '09:00');
  assert.equal(a.stato, 'nd');
  assert.equal(a.linkAvviso, 'https://www.fallcoaste.it/vendita/appartamento-1001.html');
  assert.equal(a.lat, null);
  assert.ok(a.descrizione.length <= 200);
});

test('avviso pubblicitario: provincia dal tribunale', () => {
  const x = estraiSchede(PAGINA)[1];
  const a = converti(x, SEZIONI[0], '2026-10-12');
  assert.equal(a.tipo, 'Immobile · avviso di vendita');
  assert.equal(a.tribunale, 'Napoli Nord');
  assert.equal(a.provincia, 'CE');
  assert.equal(a.rge, '132/2021');
  assert.equal(a.prezzoBase, 11730);
  assert.match(a.descrizione, /^Solo avviso pubblicitario/);
});

test('gara in corso, vendita non giudiziaria, miglior offerta al posto del prezzo base', () => {
  const x = estraiSchede(PAGINA)[2];
  const a = converti(x, SEZIONI[2], '2026-10-12'); // sezione veicoli
  assert.equal(a.categoria, 'moto');
  assert.equal(a.tipo, 'Motoveicolo · asincrona telematica · vendita non giudiziaria');
  assert.equal(a.tribunale, '');
  assert.equal(a.rge, '');
  assert.equal(a.provincia, '');
  assert.equal(a.prezzoBase, null); // la miglior offerta non è il prezzo base
  assert.equal(a.dataAsta, '2026-10-14'); // iniziata il 12/09: conta il termine della gara
  assert.equal(a.ora, '16:30');
  assert.match(a.descrizione, /Gara in corso dal 12\/09\/2026 al 14\/10\/2026/);
  assert.match(a.descrizione, /Miglior offerta alla raccolta: € 1\.650,00/);
  assert.match(a.descrizione, /Presso I\.V\.G\. BRESCIA/);
});

test('nelle sezioni veicoli caschi e accessori restano beni', () => {
  const [moto, veicoli, immobili] = [SEZIONI.find((s) => s.nome === 'moto'), SEZIONI.find((s) => s.nome === 'veicoli'), SEZIONI[0]];
  assert.deepEqual(categoriaVeicolo(veicoli, 'AUTOVETTURA FIAT PANDA TG. AB123CD'), { categoria: 'auto', genere: 'Autoveicolo' });
  assert.deepEqual(categoriaVeicolo(veicoli, 'MOTOCICLO APRILIA LEONARDO'), { categoria: 'moto', genere: 'Motoveicolo' });
  assert.deepEqual(categoriaVeicolo(moto, 'PIAGGIO VESPA 125', 'targata AB12345, cilindrata 125'), { categoria: 'moto', genere: 'Motoveicolo' });
  assert.deepEqual(categoriaVeicolo(moto, '1 casco moto Givi mis L (59/60)'), { categoria: 'beni', genere: 'Beni mobili' });
  assert.deepEqual(categoriaVeicolo(moto, 'N. 2 bauletti moto GIVI', 'I beni vengono venduti come visti e piaciuti'), { categoria: 'beni', genere: 'Beni mobili' });
  assert.deepEqual(categoriaVeicolo(immobili, 'Appartamento'), { categoria: 'immobile', genere: 'Immobile' });
});

test('vendite già concluse scartate', () => {
  const x = estraiSchede(PAGINA)[3];
  assert.equal(converti(x, SEZIONI[0], '2026-10-12'), null);
});

test('indirizzo della ricerca', () => {
  assert.equal(urlRicerca('macro|591^cat0|592', 3, 'asc'),
    'https://www.fallcoaste.it/ricerca.html?filter=macro%7C591%5Ecat0%7C592&order=termine&verso=asc&page=3');
});
