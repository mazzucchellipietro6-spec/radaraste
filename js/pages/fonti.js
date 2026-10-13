/* Pagina "Fonti": stato di ogni fonte, scritto in data/aste.js dal programma di raccolta. */
(function () {
  'use strict';
  var U = window.UI, S = window.Store, $ = U.$;
  var STATI = {
    'attiva': ['p-good', 'Attiva – raccolta ogni giorno'],
    'non-attivata': ['p-neutral', 'Leggibile, non attivata'],
    'non-verificata': ['p-warn', 'Non ancora verificata'],
    'non-raccolta': ['p-warn', 'Consentita – raccolta non ancora eseguita'],
    'bloccata': ['p-bad', 'Accesso bloccato'],
    'vietata': ['p-bad', 'Raccolta vietata'],
    'errore': ['p-bad', 'Non raggiungibile / errore']
  };
  function quando(iso) { return iso ? U.dataIt(iso.slice(0, 10)) + ' ' + new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—'; }

  document.addEventListener('DOMContentLoaded', function () {
    var R = S.infoRaccolta(), fonti = R.fonti || [];
    var termini = {}; (window.FONTI || []).forEach(function (f) { if (f.termini) termini[f.nome] = f.termini; });
    var conteggio = {}; S.aste().forEach(function (a) { if (a.origine === 'raccolta') conteggio[a.fonte] = (conteggio[a.fonte] || 0) + 1; });
    var attive = fonti.filter(function (f) { return f.stato === 'attiva'; });
    $('#riepilogo').innerHTML = attive.length
      ? '<div class="callout"><b>' + attive.length + ' fonti attive</b> su ' + fonti.length + ' · ' + S.aste().filter(function (a) { return a.origine === 'raccolta'; }).length.toLocaleString('it-IT') + ' aste raccolte · ultimo aggiornamento ' + quando(R.aggiornato) + '.</div>'
      : '<div class="callout warn"><b>Nessuna fonte attiva in questa copia del sito.</b> La raccolta non è ancora stata eseguita (oppure tutte le fonti hanno dato errore). Esegui <code>npm run raccogli</code> o attendi l\'aggiornamento automatico quotidiano. Non vengono mai mostrati dati inventati.</div>';
    $('#fonti').innerHTML = fonti.map(function (f) {
      var st = STATI[f.stato] || ['p-neutral', f.stato];
      return '<div class="src-card"><a class="t" href="' + U.esc(f.url) + '" target="_blank" rel="noopener">' + U.esc(f.nome) + ' ↗</a>' +
        '<div><span class="pill ' + st[0] + '">' + st[1] + '</span></div>' +
        '<p>' + U.esc(f.motivo || '') + '</p>' +
        (termini[f.nome] ? '<p><a href="' + U.esc(termini[f.nome]) + '" target="_blank" rel="noopener">Termini d\'uso verificati ↗</a></p>' : '') +
        '<dl>' +
          (f.metodo ? '<dt>Metodo</dt><dd>' + U.esc(f.metodo) + '</dd>' : '') +
          (f.ultimaRaccolta !== undefined ? '<dt>Ultima raccolta riuscita</dt><dd>' + quando(f.ultimaRaccolta) + '</dd>' : '') +
          '<dt>Aste in elenco</dt><dd>' + (conteggio[f.nome] || 0).toLocaleString('it-IT') + '</dd>' +
          '<dt>Ultimo controllo</dt><dd>' + U.dataIt(f.controllo) + '</dd>' +
        '</dl></div>';
    }).join('') || '<div class="panel empty">Nessuna fonte configurata.</div>';
    $('#fonti').removeAttribute('aria-busy');
  });
})();
