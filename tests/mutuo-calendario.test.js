const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/mutuo.js');
const Cal = require('../js/calendario.js');

test('rata alla francese: 100.000 € al 3% per 20 anni ≈ 554,60 €', () => {
  assert.equal(Math.round(M.rata(100000, 0.03, 20) * 100) / 100, 554.6);
  assert.equal(M.rata(120000, 0, 10), 1000);
  assert.equal(M.rata(0, 0.03, 20), 0);
});

test('capitale è l\'inverso della rata', () => {
  const c = M.capitale(554.6, 0.03, 20);
  assert.ok(Math.abs(c - 100000) < 5);
});

test('budget: rata entro un terzo del reddito tolte le altre rate', () => {
  const b = M.budget({ stipendio: 2400, altreRate: 200, risparmi: 40000, tasso: 0.035, anni: 25, speseAcquisto: 0.1 });
  assert.equal(b.rataMax, 600);
  assert.ok(b.rata <= 600);
  // i risparmi coprono anticipo + spese
  assert.ok(Math.abs(b.anticipo + b.spese - 40000) < 200, JSON.stringify(b));
  assert.ok(b.mutuo <= b.prezzoMax * 0.8 + 1);
});

test('budget limitato dall\'anticipo quando i risparmi sono pochi', () => {
  const b = M.budget({ stipendio: 6000, risparmi: 10000, tasso: 0.03, anni: 30, speseAcquisto: 0.1 });
  assert.match(b.limitatoDa, /anticipo/);
  assert.ok(Math.abs(b.prezzoMax - 33300) < 200);
});

test('sostenibile: costo totale coperto da risparmi e mutuo possibile', () => {
  const ok = M.sostenibile(110000, 100000, { stipendio: 2400, risparmi: 40000, tasso: 0.035, anni: 25 });
  assert.equal(ok.ok, true);
  const no = M.sostenibile(300000, 280000, { stipendio: 1500, risparmi: 20000, tasso: 0.035, anni: 25 });
  assert.equal(no.ok, false);
  assert.ok(no.mancano > 0);
});

test('.ics: eventi solo per le date presenti, ora di Roma, promemoria, testo protetto', () => {
  const a = { id: 'pvp-1', titolo: 'Appartamento, Genova; bilocale', dataAsta: '2026-12-01', ora: '10:30', termineOfferte: '2026-11-30', oraTermine: '12:00',
    tribunale: 'Genova', rge: '100/2024', linkAvviso: 'https://pvp.giustizia.it/pvp/it/detail_annuncio.page?idAnnuncio=1', comune: 'Genova', provincia: 'GE' };
  const t = Cal.ics(a, new Date('2026-10-13T05:00:00Z'));
  assert.equal((t.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(t, /DTSTART;TZID=Europe\/Rome:20261201T103000/);
  assert.match(t, /DTSTART;TZID=Europe\/Rome:20261130T120000/);
  assert.ok(t.includes('SUMMARY:Asta – Appartamento\\, Genova\\; bilocale'));
  assert.match(t, /TRIGGER:-P1D/);
  assert.ok(t.split('\r\n').every((r) => r.length <= 75));
  const senzaOra = Cal.ics({ id: 'x', titolo: 'Auto', dataAsta: '2026-12-02' });
  assert.match(senzaOra, /DTSTART;VALUE=DATE:20261202/);
  assert.equal((senzaOra.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('termine delle offerte con l\'ora (AAAA-MM-GGTHH:MM): data e ora separate nel calendario', () => {
  const Cal = require('../js/calendario.js');
  const s = Cal.scadenze({ id: 'pvp-1', titolo: 'Appartamento', dataAsta: '2026-12-04', ora: '10:00', termineOfferte: '2026-12-03T12:00' });
  assert.deepEqual(s.map((x) => [x.chiave, x.data, x.ora]), [['offerte', '2026-12-03', '12:00'], ['asta', '2026-12-04', '10:00']]);
  assert.ok(Cal.ics({ id: 'pvp-1', titolo: 'A', dataAsta: '2026-12-04', termineOfferte: '2026-12-03T12:00' }).includes('DTSTART;TZID=Europe/Rome:20261203T120000'));
});
