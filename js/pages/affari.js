/* Pagina "Affari di oggi" (Cacciatore): gli affari del giorno con le preferenze personali, i criteri e lo storico. */
(function () {
  'use strict';
  var U = window.UI;
  function n(x) { return Number(x || 0).toLocaleString('it-IT'); }
  function tile(et, val, nota) { return '<div class="tile"><div class="t-et">' + et + '</div><div class="t-val">' + val + '</div>' + (nota ? '<div class="t-nota">' + nota + '</div>' : '') + '</div>'; }
  function avvia() {
    window.Affari.disegna('#affari', { titolo: 'h1' });
    var A = window.AFFARI, M = A && A.misure;
    var box = document.getElementById('misure');
    if (!M) { box.innerHTML = '<p class="muted">Storico non ancora disponibile.</p>'; return; }
    box.innerHTML = tile('Aste segnalate finora', n(M.segnalate), 'dal primo giorno dell\'agente') +
      tile('Con esito pubblicato', n(M.conEsito), M.conEsito ? n(M.aggiudicate) + ' aggiudicate, ' + n(M.deserte) + ' deserte' : 'gli esiti arrivano dopo la data dell\'asta') +
      tile('Aggiudicate tra quelle con esito', M.conEsito >= 30 ? U.pct(M.aggiudicate / M.conEsito, 0) : '—', U.esc(M.nota || 'Il prezzo di aggiudicazione non è pubblicato dal Portale.'));
    var K = A.criteri;
    if (K) document.getElementById('criteri').textContent = 'Solo aste con valore di affidabilità ' + K.affidabilita.join(' o ') + ', sconto reale almeno del ' + Math.round(K.scontoMinimo * 100) +
      '% e punteggio almeno ' + K.punteggioMinimo + '; al massimo ' + (K.perProcedura === 1 ? 'un lotto' : K.perProcedura + ' lotti') + ' per procedura e ' + K.perComune + ' per comune. Se oggi ne passano meno di ' + K.minimi + ', non ne aggiunge altre per fare numero.';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
