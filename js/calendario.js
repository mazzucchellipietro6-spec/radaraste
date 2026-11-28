/* Promemoria e calendario: crea un file .ics (standard iCalendar, RFC 5545) con le scadenze di un'asta:
 * termine per le offerte, giorno dell'asta e, se indicato, termine del saldo. Solo date lette dall'avviso:
 * quelle che mancano non vengono inventate. Ora italiana (Europe/Rome). */
(function (root) {
  'use strict';

  function esc(t) { return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  // righe lunghe spezzate a 75 caratteri come vuole lo standard
  function piega(riga) { var out = [], s = riga; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); }
  function dataOra(d, ora) { var p = (ora || '').match(/^(\d{1,2})[:.](\d{2})/); return d.replace(/-/g, '') + (p ? 'T' + ('0' + p[1]).slice(-2) + p[2] + '00' : ''); }
  function piu(d, giorni) { var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + giorni); return x.toISOString().slice(0, 10); }

  var F = typeof module !== 'undefined' && module.exports ? require('./formato.js') : null;

  /* Scadenze di un'asta: [{ chiave, titolo, data, ora?, nota }] */
  function scadenze(a) {
    var out = [];
    // giorno dell'asta e termine per le offerte ('AAAA-MM-GG' o 'AAAA-MM-GGTHH:MM') letti con js/formato.js: del Demanio
    // a volte si conosce solo il termine, e allora nel calendario non c'è nessun giorno d'asta inventato
    var D = (F || root.Formato).date(a);
    if (D.termine) out.push({ chiave: 'offerte', titolo: 'Termine per le offerte', data: D.termine.data, ora: D.termine.ora, nota: 'Termine indicato nell\'avviso di vendita.' });
    if (D.asta) out.push({ chiave: 'asta', titolo: 'Asta', data: D.asta.data, ora: D.asta.ora, nota: a.fonte === 'Agenzia del Demanio' ? 'Giorno dell\'asta indicato nell\'avviso.' : 'Data e ora dell\'esperimento di vendita indicate nell\'avviso.' });
    if (a.termineSaldo) out.push({ chiave: 'saldo', titolo: 'Termine per il saldo', data: a.termineSaldo, nota: 'Termine per il versamento del saldo indicato nell\'avviso.' });
    return out;
  }

  function evento(a, s, ora) {
    var uid = (a.id || 'asta') + '-' + s.chiave + '@radaraste';
    var inizio = dataOra(s.data, s.ora), tuttoGiorno = inizio.length === 8;
    var righe = ['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + ora,
      tuttoGiorno ? 'DTSTART;VALUE=DATE:' + inizio : 'DTSTART;TZID=Europe/Rome:' + inizio,
      tuttoGiorno ? 'DTEND;VALUE=DATE:' + piu(s.data, 1).replace(/-/g, '') : 'DURATION:PT1H',
      'SUMMARY:' + esc(s.titolo + ' – ' + (a.titolo || 'asta')),
      'DESCRIPTION:' + esc(s.nota + (a.tribunale ? ' Tribunale di ' + a.tribunale + (a.rge ? ', procedura ' + a.rge : '') + '.' : '') + (a.linkAvviso ? ' Avviso: ' + a.linkAvviso : '') + ' Verifica sempre date e orari sull\'avviso originale.'),
      a.linkAvviso ? 'URL:' + a.linkAvviso : null,
      a.comune ? 'LOCATION:' + esc((a.indirizzo ? a.indirizzo + ', ' : '') + a.comune + (a.provincia ? ' (' + a.provincia + ')' : '')) : null,
      // promemoria: 3 giorni e 1 giorno prima
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(s.titolo), 'TRIGGER:-P3D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(s.titolo), 'TRIGGER:-P1D', 'END:VALARM',
      'END:VEVENT'];
    return righe.filter(Boolean);
  }

  // testo del file .ics per una o più aste
  function ics(aste, adesso) {
    var ora = (adesso || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var righe = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Radar Aste Italia//Promemoria//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
      'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'END:STANDARD',
      'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'END:DAYLIGHT',
      'END:VTIMEZONE'];
    (Array.isArray(aste) ? aste : [aste]).forEach(function (a) { scadenze(a).forEach(function (s) { righe = righe.concat(evento(a, s, ora)); }); });
    righe.push('END:VCALENDAR');
    return righe.map(piega).join('\r\n') + '\r\n';
  }

  var Calendario = { scadenze: scadenze, ics: ics };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calendario;
  else root.Calendario = Calendario;
})(typeof window !== 'undefined' ? window : globalThis);
