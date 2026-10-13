/* Pagina "Simulatore mutuo": budget massimo (js/mutuo.js) con imposte e spese d'acquisto calcolate dalle aliquote
 * (js/calcoli.js + config/tariffe.js), rata per un importo e, con ?id=, "posso permettermi questa asta?". */
(function () {
  'use strict';
  var U = window.UI, $ = U.$, M = window.Mutuo, C = window.Calcoli, T = window.TARIFFE;
  var SPESE_PROCEDURA = 1500; // stessa ipotesi del punteggio (js/punteggio.js): trasferimento, trascrizione, cancellazioni
  var asta = null;

  function valori() {
    var f = new FormData($('#muForm')), n = function (k) { var v = parseFloat(String(f.get(k) || '').replace(',', '.')); return isFinite(v) ? v : null; };
    return { stipendio: n('stipendio'), altreRate: n('altreRate') || 0, risparmi: n('risparmi'), tasso: n('tasso'), anni: n('anni'), regime: f.get('regime') };
  }
  // imposte + spese di procedura in frazione del prezzo, per il regime scelto (ricalcolate sul prezzo trovato)
  function speseSu(prezzo, regime) { return prezzo > 0 ? (C.imposteImmobile({ prezzo: prezzo, regime: regime }, T).totale + SPESE_PROCEDURA) / prezzo : 0; }
  function riga(et, val) { return '<div class="line"><span>' + et + '</span><b>' + val + '</b></div>'; }

  function aggiorna() {
    var v = valori(), box = $('#muBudget');
    if (!(v.stipendio > 0) || v.risparmi == null || v.tasso == null) { box.innerHTML = '<p class="muted">Inserisci stipendio, risparmi e tasso: senza il tasso della tua banca non facciamo stime.</p>'; }
    else {
      var f = 0.05, b;
      for (var i = 0; i < 6; i++) { b = M.budget({ stipendio: v.stipendio, altreRate: v.altreRate, risparmi: v.risparmi, tasso: v.tasso / 100, anni: v.anni, speseAcquisto: f }); f = speseSu(b.prezzoMax, v.regime) || f; }
      var reg = T.immobili.regimi.filter(function (x) { return x.id === v.regime; })[0] || T.immobili.regimi[0];
      box.innerHTML = '<div class="mu-esito"><span class="note">Prezzo d\'acquisto massimo</span><span class="grande">' + U.eur(b.prezzoMax) + '</span></div>' +
        '<div class="result">' + riga('Mutuo', U.eur(b.mutuo)) + riga('Anticipo con i tuoi risparmi', U.eur(b.anticipo)) + riga('Imposte e spese d\'acquisto', U.eur(b.spese)) +
        riga('Rata mensile', U.eur(b.rata)) + riga('Rata massima sostenibile', U.eur(b.rataMax)) + '</div>' +
        '<p class="note">Limitato da: ' + U.esc(b.limitatoDa) + '. Imposte con il regime "' + U.esc(reg.nome) + '" (' + U.esc(reg.fonte) + ', verificato il ' + U.dataIt(reg.verificato) + ') e ' + U.eur(SPESE_PROCEDURA) + ' di spese di procedura (ipotesi).</p>';
    }
    var cap = parseFloat($('#muCapitale').value), r = $('#muRata');
    if (cap > 0 && v.tasso != null && v.anni > 0) {
      var rata = M.rata(cap, v.tasso / 100, v.anni), tot = rata * v.anni * 12;
      r.innerHTML = '<div class="result">' + riga('Rata mensile', U.eur(rata)) + riga('Totale rimborsato in ' + v.anni + ' anni', U.eur(tot)) + riga('Di cui interessi', U.eur(tot - cap)) + '</div>' +
        '<p class="note">Ammortamento alla francese (rata costante) con il tasso e la durata indicati da te.</p>';
    } else r.innerHTML = '<p class="muted">Inserisci importo e tasso.</p>';
    if (asta) permetto(v);
  }
  // "posso permettermi questa asta?" con il costo totale calcolato dalla raccolta
  function permetto(v) {
    var box = $('#muAsta'), a = asta;
    var testa = '<b>' + U.esc(String(a.titolo || '').slice(0, 120)) + '</b> · prezzo base ' + U.eur(a.prezzoBase) + (a.costoTotale ? ', costo totale stimato ' + U.eur(a.costoTotale) : '') + '. ';
    if (!(v.stipendio > 0) || v.risparmi == null || v.tasso == null || !a.costoTotale) { box.innerHTML = testa + (a.costoTotale ? 'Inserisci i tuoi dati per sapere se puoi permettertela.' : 'Costo totale non stimato per questa asta.'); return; }
    var s = M.sostenibile(a.costoTotale, a.prezzoBase, { stipendio: v.stipendio, altreRate: v.altreRate, risparmi: v.risparmi, tasso: v.tasso / 100, anni: v.anni });
    box.className = 'callout' + (s.ok ? '' : ' warn');
    box.innerHTML = testa + (s.ok ? 'Sì, al prezzo base: mutuo di ' + U.eur(s.mutuo) + ', rata ' + U.eur(s.rata) + ' (massimo sostenibile ' + U.eur(s.rataMax) + ').'
      : 'Al prezzo base mancano circa ' + U.eur(s.mancano) + ': servirebbe un mutuo di ' + U.eur(s.mutuo) + ', oltre quanto sostenibile con questi dati.') + ' <a href="scheda.html?id=' + encodeURIComponent(a.id) + '">Torna alla scheda</a>';
  }

  function avvia() {
    $('#muRegime').innerHTML = T.immobili.regimi.filter(function (r) { return !/terreno|strumentale/.test(r.id); }).map(function (r) {
      return '<option value="' + r.id + '"' + (r.id === 'prima-privato' ? ' selected' : '') + '>' + U.esc(r.nome + ' – ' + r.gruppo) + '</option>';
    }).join('');
    try { var s = JSON.parse(localStorage.getItem('radaraste.mutuo') || 'null'); if (s) Object.keys(s).forEach(function (k) { var el = $('#muForm [name="' + k + '"]'); if (el && s[k] != null) el.value = s[k]; }); } catch (e) {}
    $('#muForm').addEventListener('input', function () { try { localStorage.setItem('radaraste.mutuo', JSON.stringify(valori())); } catch (e) {} aggiorna(); });
    $('#muCapitale').addEventListener('input', aggiorna);
    var id = U.parametro('id');
    if (id && window.Dettagli) {
      $('#muAsta').hidden = false; $('#muAsta').textContent = 'Carico l\'asta…';
      window.Dettagli.carica(id).then(function (a) { if (a) { asta = a; aggiorna(); } else $('#muAsta').textContent = 'Asta non trovata.'; }, function () { $('#muAsta').textContent = 'Asta non disponibile.'; });
    }
    aggiorna();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
