/* Pagina "Stratega d'asta": profilo dell'utente → Stratega.esegui (js/stratega.js) sulle aste in corso (data/aste.js,
 * caricato in background) con le statistiche degli esiti passati (data/statistiche.js). Mostra il piano, il patrimonio
 * nel tempo su 1–5 anni (Stratega.proiezione e Stratega.datiGrafico), la simulazione Monte Carlo (istogramma delle aste
 * vinte), le ipotesi, cosa non sappiamo e l'avviso. Si ricalcola da solo quando cambia un campo del modulo. */
(function () {
  'use strict';
  var U = window.UI, $ = U.$, S = window.Stratega;
  var K_PROFILO = 'radaraste.stratega';   // profilo e campi "Su più anni" (suPiuAnni), descritto in cookie.html
  var CAMPI_ANNI = ['anni', 'rivalutazione', 'costiAffitto', 'mesiRivendita', 'costiVendita', 'tassoMutuo', 'reinvesti'];
  var NOMI_STRATEGIA = { vivere: 'Ci vado a vivere', affittare: 'Lo affitto', rivendere: 'Lo rivendo' };
  var aste = null, caricamento = null, semestreOmi = null;
  var ultimo = null, proiezione = null, grafico = null;   // ultimo piano, ultima proiezione, grafico disegnato

  function caricaAste() {
    if (aste) return Promise.resolve(aste);
    if (caricamento) return caricamento;
    caricamento = new Promise(function (ok) {
      var s = document.createElement('script'); s.src = 'data/aste.js'; s.async = true;
      s.onload = function () {
        aste = window.Store ? window.Store.aste() : [];
        var R = window.ASTE_RACCOLTE, o = R && R.punteggio && R.punteggio.omi;
        semestreOmi = o && o.semestre ? o.semestre : null;   // semestre delle quotazioni OMI usate dalla raccolta
        ok(aste);
      };
      s.onerror = function () { aste = []; ok(aste); };
      document.head.appendChild(s);
    });
    return caricamento;
  }
  function profiloDalForm() {
    var f = new FormData($('#stForm')), n = function (k) { var v = parseFloat(String(f.get(k) || '').replace(',', '.')); return isFinite(v) ? v : 0; };
    return { capitale: n('capitale'), mutuo: n('mutuo'), orizzonteMesi: n('orizzonteMesi') || 6, strategia: f.get('strategia'), prudenza: f.get('prudenza'),
      regioni: f.get('regione') ? [f.get('regione')] : [], concorrenza: n('concorrenza') / 100, categoria: 'immobile' };
  }
  // campi "Su più anni": vuoto = valore predefinito del motore; le percentuali diventano frazioni
  function anniDalForm() {
    var f = new FormData($('#stForm'));
    function v(k) { var s = String(f.get(k) == null ? '' : f.get(k)).replace(',', '.').trim(); if (s === '') return null; var x = parseFloat(s); return isFinite(x) ? x : null; }
    function perc(k) { var x = v(k); return x == null ? null : x / 100; }
    return { anni: v('anni'), rivalutazione: perc('rivalutazione'), costiAffitto: perc('costiAffitto'), mesiRivendita: v('mesiRivendita'),
      costiVendita: perc('costiVendita'), tassoMutuo: perc('tassoMutuo'), reinvesti: f.get('reinvesti') === 'si' };
  }
  function n(x) { return Number(x || 0).toLocaleString('it-IT'); }
  function tile(et, val, nota) { return '<div class="tile"><div class="t-et">' + et + '</div><div class="t-val">' + val + '</div>' + (nota ? '<div class="t-nota">' + nota + '</div>' : '') + '</div>'; }
  function anniTesto(a) { return a === 1 ? '1 anno' : a + ' anni'; }

  // istogramma delle aste vinte nelle simulazioni: una sola serie, barre sottili con l'estremo arrotondato, etichette %
  function istogramma(v) {
    var h = v.istogramma || [], W = 520, H = 190, sx = 36, base = H - 28, alto = 18, larg = Math.min(64, (W - sx - 10) / Math.max(1, h.length) - 12);
    var max = Math.max.apply(null, h.concat([0.01]));
    var passo = (W - sx - 10) / Math.max(1, h.length);
    var barre = h.map(function (p, i) {
      var x = sx + i * passo + (passo - larg) / 2, hh = Math.max(p > 0 ? 2 : 0, (base - alto) * p / max), y = base - hh;
      var r = Math.min(4, hh / 2), etich = U.pct(p, 0);
      var d = hh > 0 ? 'M' + x + ' ' + base + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + larg - r) + 'Q' + (x + larg) + ' ' + y + ' ' + (x + larg) + ' ' + (y + r) + 'V' + base + 'Z' : '';
      return '<g class="st-barra"><title>' + i + (i === 1 ? ' asta vinta' : ' aste vinte') + ': ' + etich + ' delle simulazioni</title>' +
        '<rect x="' + (x - 6) + '" y="' + alto + '" width="' + (larg + 12) + '" height="' + (base - alto) + '" fill="transparent"/>' +
        (d ? '<path d="' + d + '" style="fill:var(--accent)"/>' : '') +
        '<text x="' + (x + larg / 2) + '" y="' + (y - 6) + '" text-anchor="middle" class="st-val">' + etich + '</text>' +
        '<text x="' + (x + larg / 2) + '" y="' + (base + 18) + '" text-anchor="middle">' + i + '</text></g>';
    }).join('');
    return '<svg class="grafico st-grafico" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Aste vinte nelle simulazioni: ' + h.map(function (p, i) { return i + ' ' + U.pct(p, 0); }).join(', ') + '">' +
      '<line class="asse" x1="' + sx + '" x2="' + (W - 6) + '" y1="' + base + '" y2="' + base + '"/>' + barre +
      '<text x="' + sx + '" y="' + (H - 1) + '" class="st-asse">aste vinte →</text></svg>' +
      '<details class="st-tabella"><summary>I numeri del grafico</summary><table class="responsive"><thead><tr><th>Aste vinte</th><th class="num">Simulazioni</th><th class="num">Quota</th></tr></thead><tbody>' +
      h.map(function (p, i) { return '<tr><td data-label="Aste vinte"><span class="v">' + i + '</span></td><td class="num" data-label="Simulazioni"><span class="v">' + n((v.conteggi || [])[i]) + '</span></td><td class="num" data-label="Quota"><span class="v">' + U.pct(p, 1) + '</span></td></tr>'; }).join('') +
      '</tbody></table></details>';
  }

  function rigaScelta(c, sim) {
    var pa = (sim.perAsta || []).filter(function (x) { return x.id === c.id; })[0], v = c.valore || {}, p = c.probabilita || {};
    var aff = { alta: 'p-good', media: 'p-info' }[v.affidabilita] || 'p-warn';
    return '<article class="st-scelta">' +
      '<header><span class="st-data">' + U.dataIt(c.dataAsta) + '</span><h3><a href="scheda.html?id=' + encodeURIComponent(c.id) + '" data-passa="id:' + U.esc(c.id) + '">' + U.esc(c.titolo) + '</a></h3>' +
      '<p class="note">' + U.esc([c.comune ? c.comune + (c.provincia ? ' (' + c.provincia + ')' : '') : '', c.tribunale ? 'Tribunale di ' + c.tribunale : '', c.tentativo ? c.tentativo + '° tentativo' : ''].filter(Boolean).join(' · ')) + '</p></header>' +
      '<dl class="cb-numeri">' +
        '<div><dt>Offerta consigliata</dt><dd>' + U.eur(c.offerta) + '<small>minima ' + U.eur(c.offertaMinima) + ' · massima ' + U.eur(c.offertaMax) + '</small></dd></div>' +
        '<div><dt>Cauzione</dt><dd>' + U.eur(c.cauzione && c.cauzione.importo) + '<small>entro il ' + U.dataIt(c.dataCauzione && c.dataCauzione.data) + '</small></dd></div>' +
        '<div><dt>Se vinci paghi</dt><dd>' + U.eur(c.costoTotale) + '<small>saldo entro il ' + U.dataIt(c.dataSaldo && c.dataSaldo.data) + (c.mutuoUsato ? ', mutuo ' + U.eur(c.mutuoUsato) : '') + '</small></dd></div>' +
        '<div><dt>Valore minimo</dt><dd>' + U.eur(v.min) + '<small><span class="pill ' + aff + '">' + U.esc(v.affidabilita || 'n.d.') + '</span> ' + U.esc(v.fonte === 'omi' ? 'OMI della zona' : v.fonte === 'perizia' ? 'perizia' : v.fonte || '') + '</small></dd></div>' +
        '<div><dt>Probabilità di vincerla</dt><dd>' + U.pct(p.vincere, 0) + '<small>' + (p.intervallo ? 'tra ' + U.pct(p.intervallo[0], 0) + ' e ' + U.pct(p.intervallo[1], 0) : '') + (pa ? '; vinta nel ' + U.pct(pa.vinta, 0) + ' delle simulazioni' : '') + '</small></dd></div>' +
      '</dl>' +
      '<details class="st-fonte"><summary>Perché questa offerta e da dove viene la probabilità</summary><p class="fonte">' + U.esc(c.motivoOfferta || '') + '</p><p class="fonte">' + U.esc(p.fonte || '') + '</p></details></article>';
  }

  function disegna(r) {
    var pi = r.piano, sim = r.simulazione, sp = r.spiegazione, box = $('#stEsito');
    grafico = null;
    if (r.profilo.errori && r.profilo.errori.length) { box.innerHTML = '<div class="panel"><p class="cs-avviso">' + U.esc(r.profilo.errori.join(' ')) + '</p></div>'; return; }
    var testa = '<section class="panel stack" style="gap:14px" aria-labelledby="h-piano"><h2 id="h-piano">Il piano</h2><p>' + U.esc(pi.sintesi && pi.sintesi.testo || '') + '</p>';
    var patrimonio = '<section class="panel stack pt-sezione" id="stPatrimonio" aria-labelledby="h-patrimonio"></section>';
    if (!pi.scelte.length) {
      box.innerHTML = testa + '<p class="note">' + U.esc((pi.motiviPrincipali || []).join(' · ') || 'Nessuna asta adatta con queste scelte: meglio aspettare che forzare un piano.') + '</p></section>' + patrimonio + spiegazione(sp);
      disegnaPatrimonio();
      return;
    }
    testa += '<div class="ar-numeri">' +
      tile('Aste nel piano', n(pi.scelte.length), 'tra ' + n(r.candidati.candidati.length) + ' adatte al tuo profilo, con valore affidabile') +
      tile('Cassa se le vinci tutte', U.eur(pi.sintesi.cassaSeVinciTutte), 'su ' + U.eur(r.profilo.capitale) + ' di capitale') +
      tile('Ne vinci almeno una', U.pct(sim.almenoUna, 0), sim.forchetta ? 'tra ' + U.pct(sim.forchetta.almenoUna[0], 0) + ' e ' + U.pct(sim.forchetta.almenoUna[1], 0) : '') +
      // una cifra sola per il guadagno: la media delle simulazioni (regola di cassa e "una sola casa" comprese)
      tile('Margine medio nelle simulazioni', U.eur(sim.guadagno.media), 'sul valore minimo: dal ' + U.eur(sim.guadagno.p10) + ' (caso basso) al ' + U.eur(sim.guadagno.p90) + ' (caso alto)') +
      '</div><p class="note">' + U.esc(pi.sintesi.regola || '') + ' Simulazioni con offerte superiori alla cassa: ' + U.pct(sim.sforamento || 0, 0) + '.</p></section>';
    var scelte = '<section class="stack" style="gap:12px" aria-labelledby="h-scelte"><h2 id="h-scelte">Le aste, in ordine di data</h2>' + pi.scelte.map(function (c) { return rigaScelta(c, sim); }).join('') + '</section>';
    var simul = '<section class="panel stack" style="gap:10px" aria-labelledby="h-sim"><h2 id="h-sim">Quante ne vinci: ' + n(sim.n) + ' simulazioni</h2>' +
      '<p class="note">Ogni simulazione gioca le aste del piano in ordine di data con le probabilità indicate; in media ne vinci ' + String(Math.round(sim.vinte.media * 10) / 10).replace('.', ',') + '. Capitale usato: mediana ' + U.eur(sim.capitaleUsato.p50) + ', al massimo ' + U.eur(sim.capitaleUsato.p90) + ' nel 90% dei casi.</p>' +
      istogramma(sim.vinte) + '</section>';
    box.innerHTML = testa + patrimonio + scelte + simul + spiegazione(sp);
    disegnaPatrimonio();
  }
  function lista(t, l) { return l && l.length ? '<div><h3>' + t + '</h3><ul>' + l.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></div>' : ''; }
  function spiegazione(sp) {
    if (!sp) return '';
    return '<section class="panel stack" style="gap:12px" aria-labelledby="h-ipo"><h2 id="h-ipo">Su cosa si basa il piano</h2><div class="cb-due">' +
      lista('Ipotesi e fonti', sp.ipotesi) + lista('Cosa non sappiamo', sp.nonSappiamo) + '</div>' + lista('Attenzione', sp.avvertenze) + '</section>';
  }

  /* ---------- il patrimonio nel tempo ---------- */

  function disegnaPatrimonio() {
    var box = $('#stPatrimonio');
    if (!box || !ultimo) return;
    var o = anniDalForm();
    salva();
    var p;
    try {
      var opz = { T: window.TARIFFE, semestreOmi: semestreOmi };
      for (var k in o) opz[k] = o[k];
      p = S.proiezione(ultimo, opz);
    } catch (e) {
      box.innerHTML = '<h2 id="h-patrimonio">Il patrimonio nel tempo</h2><p class="cs-avviso">Non riesco a calcolare il patrimonio nel tempo: ' + U.esc(e.message) + '</p>';
      return;
    }
    proiezione = p;
    box.innerHTML = sezionePatrimonio(p);
    disegnaGrafico();
  }

  function sezionePatrimonio(p) {
    var A = p.anni, u = p.finale, P = u.patrimonio, dati = S.datiGrafico(p, { larghezza: 640 });
    var h = '<h2 id="h-patrimonio">Il patrimonio nel tempo</h2>' +
      '<p class="callout warn pt-avviso"><b>Simulazione, non consulenza finanziaria.</b> Sono calcoli con ipotesi, non previsioni: verifica sempre avviso e perizia e senti un professionista prima di impegnare il capitale.</p>';
    var avvisi = p.avvertenze && p.avvertenze.length ? '<div class="callout warn pt-avvisi"><h3>Dati mancanti e limiti</h3><ul>' + p.avvertenze.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
    if (dati.vuoto) return h + '<p>' + U.esc(dati.riassunto) + '</p>' + avvisi;
    h += '<p class="note">Cassa + immobili − mutuo da restituire, alla fine di ogni anno per ' + anniTesto(A) + ', in ' + n(p.n) + ' simulazioni del piano. Strategia: ' + U.esc(NOMI_STRATEGIA[p.strategia] || p.strategia) + '.</p>' + avvisi;
    // affitti e imposte: la cifra della simulazione mediana, la stessa del riquadro dell'anno e della tabella
    // (prima qui c'era la mediana degli affitti di tutte le simulazioni: due cifre diverse per la stessa voce)
    var diff = P.p50 - p.capitale, frase = '', um = u.mediana || {}, SIM_MEDIANA = 'nella simulazione mediana (quella con il patrimonio a metà classifica), la stessa del grafico e della tabella';
    if (p.strategia === 'affittare') {
      frase = p.affitto && p.affitto.conQuotazione
        ? 'Affitti incassati in ' + anniTesto(A) + ', già tolti costi e sfitto: <b>' + U.eur(um.affitti) + '</b> ' + SIM_MEDIANA + '.'
        : 'Affitti: <b>non stimati</b>, perché per nessuna asta del piano c\'è la quotazione OMI di locazione.';
    } else if (p.strategia === 'rivendere') {
      frase = p.vendite.quotaGiri
        ? 'Imposta sulle plusvalenze pagata in ' + anniTesto(A) + ': <b>' + U.eur(um.imposte) + '</b> ' + SIM_MEDIANA + '. Media di tutte le simulazioni: ' + U.eur(p.vendite.impostaMedia) +
          ' di imposta e ' + String(Math.round(p.vendite.media * 10) / 10).replace('.', ',') + ' vendite.'
        : 'Nessuna vendita entro ' + anniTesto(A) + ': il patrimonio conta il valore stimato degli immobili, non un incasso.';
    } else frase = 'Compri casa nel <b>' + U.pct(u.posseduti, 0) + '</b> delle simulazioni.';
    h += '<div class="ar-numeri">' +
      tile('Dopo ' + anniTesto(A) + ', mediana', U.eur(P.p50), (diff >= 0 ? '+' : '−') + U.eur(Math.abs(diff)) + ' rispetto ai ' + U.eur(p.capitale) + ' di oggi') +
      tile('Caso basso', U.eur(P.p10), '1 simulazione su 10 va peggio') +
      tile('Caso alto', U.eur(P.p90), '1 simulazione su 10 va meglio') + '</div><p class="pt-frase">' + frase + '</p>';
    h += '<figure class="pt-figura">' +
      '<div class="pt-grafico" tabindex="0" role="group" aria-label="Grafico del patrimonio anno per anno" aria-describedby="ptTasti"><div class="pt-svg-box"></div><div class="pt-tip" aria-hidden="true" hidden></div></div>' +
      '<figcaption class="pt-legenda"><span><i class="pt-k-linea" aria-hidden="true"></i>Mediana: metà delle simulazioni sta sopra, metà sotto</span>' +
      '<span><i class="pt-k-fascia" aria-hidden="true"></i>Fascia: 8 simulazioni su 10 stanno qui dentro</span>' +
      '<span id="ptTasti">Passa il mouse o tocca un anno per vedere i numeri; con la tastiera usa le frecce.</span></figcaption></figure>';
    h += tabellaPatrimonio(p, dati);
    h += '<div class="cb-due">' + lista('Ipotesi', p.ipotesi) + '<div><h3>Fonti</h3><ul>' + p.fonti.map(function (f) {
      var nome = U.esc(f.nome) + (f.uso ? ' <span class="muted">(' + U.esc(f.uso) + ')</span>' : '');
      return '<li>' + (f.url ? '<a href="' + U.esc(f.url) + '" target="_blank" rel="noopener">' + U.esc(f.nome) + '</a>' + (f.uso ? ' <span class="muted">(' + U.esc(f.uso) + ')</span>' : '') : nome) + '</li>';
    }).join('') + '<li>Valore degli immobili: perizia, prima asta o quotazioni OMI, come indicato per ogni asta del piano</li></ul></div></div>' +
      lista('Cosa non sappiamo', p.nonSappiamo);
    return h;
  }

  function tabellaPatrimonio(p, d) {
    var col = [['Cassa', 'cassa'], ['Immobili', 'immobili']];
    if (p.mutuo) col.push(['Mutuo da restituire', 'debito']);
    if (p.strategia === 'affittare') col.push(['Affitti incassati', 'affitti']);
    if (p.strategia === 'rivendere') col.push(['Imposte pagate', 'imposte']);
    var testa = '<tr><th>Anno</th><th class="num">Caso basso</th><th class="num">Mediana</th><th class="num">Caso alto</th>' + col.map(function (c) { return '<th class="num">' + c[0] + '*</th>'; }).join('') + '</tr>';
    var righe = d.punti.map(function (q) {
      var m = q.mediana || {};
      return '<tr><td data-label="Anno"><span class="v">' + q.etichetta + ' <span class="muted">(' + q.quando + ')</span></span></td>' +
        '<td class="num" data-label="Caso basso"><span class="v">' + U.eur(q.p10) + '</span></td><td class="num" data-label="Mediana"><span class="v">' + U.eur(q.p50) + '</span></td>' +
        '<td class="num" data-label="Caso alto"><span class="v">' + U.eur(q.p90) + '</span></td>' +
        col.map(function (c) { return '<td class="num" data-label="' + c[0] + '*"><span class="v">' + U.eur(m[c[1]]) + '</span></td>'; }).join('') + '</tr>';
    }).join('');
    return '<details class="st-tabella"><summary>I numeri del grafico</summary><table class="responsive"><thead>' + testa + '</thead><tbody>' + righe + '</tbody></table>' +
      '<p class="note">* Nella simulazione mediana: cassa + immobili − mutuo dà la mediana. Caso basso e caso alto: 10° e 90° percentile.</p></details>';
  }

  // SVG del grafico alla larghezza vera del riquadro (testi leggibili anche su telefono)
  function svgGrafico(d) {
    var pz = d.piano, s = '<svg class="grafico pt-svg" width="' + d.larghezza + '" height="' + d.altezza + '" viewBox="0 0 ' + d.larghezza + ' ' + d.altezza + '" role="img" aria-labelledby="ptTit ptDesc">' +
      '<title id="ptTit">Il patrimonio nel tempo</title><desc id="ptDesc">' + U.esc(d.riassunto) + '</desc>';
    d.scala.tacche.forEach(function (t) {
      s += '<line class="' + (t.valore === 0 ? 'asse' : 'pt-griglia') + '" x1="' + pz.x0 + '" x2="' + pz.x1 + '" y1="' + t.y + '" y2="' + t.y + '"/>' +
        '<text class="pt-tacca" x="' + (pz.x0 - 8) + '" y="' + (t.y + 4) + '" text-anchor="end">' + U.esc(t.testo) + '</text>';
    });
    d.asseX.forEach(function (a, i) {
      s += '<text class="pt-anno" x="' + a.x + '" y="' + (d.altezza - 9) + '" text-anchor="' + (i === 0 ? 'start' : 'middle') + '">' + U.esc(a.testo) + '</text>';
    });
    if (d.nomeAsse) s += '<text class="pt-anno" x="' + (pz.x1 + 12) + '" y="' + (d.altezza - 9) + '">' + U.esc(d.nomeAsse) + '</text>';
    s += '<path class="pt-area" d="' + d.area + '"/><path class="pt-linea" d="' + d.linea + '"/>';
    var u = d.punti[d.punti.length - 1];
    s += '<circle class="pt-punto" cx="' + u.x + '" cy="' + u.y50 + '" r="4.5"/>';
    d.etichette.forEach(function (e) {
      if (e.guida) s += '<line class="pt-guida-e" x1="' + (u.x + 5) + '" x2="' + (u.x + 10) + '" y1="' + e.y + '" y2="' + e.c + '"/>';
      s += '<text class="pt-valore" x="' + (u.x + 12) + '" y="' + (e.c + 4) + '">' + U.esc(e.testo) + '</text>';
      e.righe.forEach(function (r, k) { s += '<text class="pt-nome" x="' + (u.x + 12) + '" y="' + (e.c + 17 + 13 * k) + '">' + U.esc(r) + '</text>'; });
    });
    s += '<g class="pt-guida" hidden><line class="pt-guida-l" x1="0" x2="0" y1="' + pz.y0 + '" y2="' + pz.y1 + '"/>' +
      '<circle class="pt-punto-f" data-q="90" r="3.5"/><circle class="pt-punto-f" data-q="10" r="3.5"/><circle class="pt-punto" data-q="50" r="5"/></g>';
    d.punti.forEach(function (q, i) { s += '<rect class="pt-zona" data-i="' + i + '" x="' + q.zona.x + '" y="0" width="' + q.zona.larghezza + '" height="' + d.altezza + '"/>'; });
    return s + '</svg>';
  }

  function rigaTip(valore, nome, chiave) { return '<div class="pt-tip-r">' + (chiave ? '<i class="pt-k-' + chiave + '" aria-hidden="true"></i>' : '') + '<b>' + valore + '</b><span>' + nome + '</span></div>'; }
  function testoTip(q, p) {
    var m = q.mediana || {}, h = '<p class="pt-tip-t"><b>' + q.etichetta + '</b> · ' + q.quando + '</p>' +
      rigaTip(U.eur(q.p50), 'mediana', 'linea') +
      (q.p10 === q.p90 ? '' : rigaTip(U.eur(q.p10) + ' – ' + U.eur(q.p90), 'fascia, 8 su 10', 'fascia'));
    h += '<p class="pt-tip-s">Nella simulazione mediana</p>' + rigaTip(U.eur(m.cassa), 'cassa') + rigaTip(U.eur(m.immobili), 'immobili');
    if (p.mutuo) h += rigaTip((m.debito ? '−' : '') + U.eur(m.debito), 'mutuo');
    if (p.strategia === 'affittare' && q.anno) h += rigaTip(U.eur(m.affitti), 'affitti incassati');
    if (p.strategia === 'rivendere' && q.anno) h += rigaTip(U.eur(m.imposte), 'imposte pagate');
    return h;
  }

  function disegnaGrafico() {
    var box = $('#stPatrimonio'), wrap = box && box.querySelector('.pt-grafico');
    if (!wrap || !proiezione) { grafico = null; return; }
    var larg = Math.floor(wrap.clientWidth) || 640;
    var d = S.datiGrafico(proiezione, { larghezza: larg }), p = proiezione;
    wrap.querySelector('.pt-svg-box').innerHTML = svgGrafico(d);
    var svg = wrap.querySelector('svg'), tip = wrap.querySelector('.pt-tip'), guida = svg.querySelector('.pt-guida'), attivo = -1;
    // su telefono i numeri dell'anno stanno fissi sotto il grafico (non lo coprono); al computer accanto alla linea guida
    var compatto = d.compatto, aiuto = box.querySelector('#ptTasti');
    wrap.classList.toggle('pt-compatto', compatto);
    if (aiuto) aiuto.textContent = compatto ? 'Tocca un anno per vedere i suoi numeri qui sopra.' : 'Passa il mouse o tocca un anno per vedere i numeri; con la tastiera usa le frecce.';
    function mostra(i) {
      if (i < 0 || i >= d.punti.length) return;
      attivo = i;
      var q = d.punti[i];
      guida.removeAttribute('hidden');
      guida.querySelector('line').setAttribute('x1', q.x); guida.querySelector('line').setAttribute('x2', q.x);
      [['50', q.y50], ['90', q.y90], ['10', q.y10]].forEach(function (c) { var el = guida.querySelector('[data-q="' + c[0] + '"]'); el.setAttribute('cx', q.x); el.setAttribute('cy', c[1]); });
      tip.innerHTML = testoTip(q, p);
      tip.hidden = false;
      if (compatto) { tip.style.left = ''; return; }
      // accanto alla linea guida, dal lato dove c'è posto
      var w = tip.offsetWidth, scala = svg.getBoundingClientRect().width / d.larghezza || 1, x = q.x * scala;
      var sinistra = x + 14 + w <= wrap.clientWidth ? x + 14 : Math.max(0, x - 14 - w);
      tip.style.left = Math.round(sinistra) + 'px';
    }
    function nascondi() { if (compatto) return; attivo = -1; guida.setAttribute('hidden', ''); tip.hidden = true; }
    function daPuntatore(e) {
      var r = svg.getBoundingClientRect();
      mostra(S.puntoVicino(d, (e.clientX - r.left) * d.larghezza / r.width));
    }
    svg.addEventListener('pointermove', daPuntatore);
    svg.addEventListener('pointerdown', daPuntatore);
    wrap.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') nascondi(); });
    wrap.addEventListener('focus', function () { if (attivo < 0) mostra(d.punti.length - 1); });
    wrap.addEventListener('blur', nascondi);
    wrap.addEventListener('keydown', function (e) {
      var i = attivo < 0 ? d.punti.length - 1 : attivo;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') i = Math.min(d.punti.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') i = Math.max(0, i - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = d.punti.length - 1;
      else if (e.key === 'Escape') { nascondi(); return; }
      else return;
      e.preventDefault();
      mostra(i);
    });
    if (compatto) mostra(d.punti.length - 1);
    grafico = { wrap: wrap, larghezza: larg, nascondi: nascondi };
  }

  /* ---------- calcolo e ricalcolo ---------- */

  // un solo oggetto nel browser: il profilo con dentro i campi su più anni
  function salva() {
    var dati = profiloDalForm();
    dati.suPiuAnni = anniDalForm();
    try { localStorage.setItem(K_PROFILO, JSON.stringify(dati)); } catch (e) {}
  }
  function stato(t) { var el = $('#stStato'); if (el) el.textContent = t; }
  function testoStato(soloAnni) {
    if (!ultimo) return '';
    var t = soloAnni ? 'Patrimonio aggiornato.' : 'Piano aggiornato: ' + ultimo.piano.scelte.length + (ultimo.piano.scelte.length === 1 ? ' asta.' : ' aste.');
    if (proiezione && proiezione.aste) t += ' Dopo ' + anniTesto(proiezione.anni) + ' il patrimonio ha mediana ' + U.eur(proiezione.finale.patrimonio.p50) + '.';
    return t;
  }

  // dolce: ricalcolo per un campo cambiato, senza svuotare la pagina (il risultato vecchio resta, attenuato)
  function calcola(dolce) {
    var prof = profiloDalForm(), box = $('#stEsito');
    salva();
    if (!(prof.capitale > 0)) { ultimo = null; proiezione = null; grafico = null; box.innerHTML = '<div class="panel"><p class="muted">Inserisci il capitale disponibile.</p></div>'; return; }
    if (dolce && ultimo) box.classList.add('st-aggiorna');
    else box.innerHTML = '<div class="panel"><p class="muted">Carico le aste in corso e calcolo il piano…</p></div>';
    caricaAste().then(function (l) {
      if (!l.length) { ultimo = null; box.classList.remove('st-aggiorna'); box.innerHTML = '<div class="panel"><p class="muted">Nessuna asta disponibile in questa copia del sito.</p></div>'; return; }
      // lascia aggiornare la pagina prima del calcolo (qualche decimo di secondo)
      setTimeout(function () {
        ultimo = S.esegui(l, prof, { T: window.TARIFFE, stat: window.STATISTICHE || null, oggi: U.oggi() });
        disegna(ultimo);
        box.classList.remove('st-aggiorna');
        stato(testoStato(false));
      }, 20);
    });
  }

  // un solo ricalcolo dopo una pausa nella digitazione: tutto il piano se cambia il profilo, solo il patrimonio se cambiano i campi su più anni
  var attesa = null, daRifare = null;
  function programma(nome) {
    var soloAnni = CAMPI_ANNI.indexOf(nome) >= 0;
    if (!soloAnni || daRifare === 'tutto') daRifare = 'tutto'; else daRifare = 'anni';
    clearTimeout(attesa);
    attesa = setTimeout(function () {
      var cosa = daRifare; daRifare = null;
      if (cosa === 'anni' && ultimo && $('#stPatrimonio')) { disegnaPatrimonio(); stato(testoStato(true)); }
      else calcola(true);
    }, soloAnni ? 200 : 450);
  }

  // campi che contano solo per una strategia o con il mutuo
  function aggiornaCampi() {
    var f = $('#stForm'), strategia = f.elements.strategia.value, mutuo = parseFloat(String(f.elements.mutuo.value || '').replace(',', '.')) > 0;
    Array.prototype.forEach.call(f.querySelectorAll('[data-solo]'), function (el) { el.hidden = el.getAttribute('data-solo') !== strategia; });
    Array.prototype.forEach.call(f.querySelectorAll('[data-non]'), function (el) { el.hidden = el.getAttribute('data-non') === strategia; });
    Array.prototype.forEach.call(f.querySelectorAll('[data-mutuo]'), function (el) { el.hidden = !mutuo; });
  }

  function avvia() {
    if (!S) { $('#stEsito').innerHTML = '<p class="cs-avviso">Il motore dello Stratega non si è caricato (js/stratega.js).</p>'; return; }
    var f = $('#stForm');
    $('#stRegione').insertAdjacentHTML('beforeend', (window.GEO && window.GEO.regioni || []).map(function (r) { return '<option>' + U.esc(r) + '</option>'; }).join(''));
    $('#stDisclaimer').textContent = S.DISCLAIMER;
    // valori proposti dal motore, così pagina e calcolo non si separano
    var B = S.PROIEZIONE_BASE, costiBase = Math.round(S.costiAffittoBase(window.TARIFFE) * 100);
    f.elements.anni.value = String(B.anni);
    function cento(x) { return String(Math.round(x * 10000) / 100); }
    f.elements.rivalutazione.value = cento(B.rivalutazione);
    f.elements.costiAffitto.value = String(costiBase);
    f.elements.mesiRivendita.value = String(B.mesiRivendita);
    f.elements.costiVendita.value = cento(B.costiVendita);
    $('#stCostiBase').textContent = costiBase + '%';
    var AF = window.TARIFFE && window.TARIFFE.affitto;
    if (AF && AF.ipotesi && AF.cedolareLibero) {
      $('#aiCosti').textContent = 'La parte dell\'affitto che non resta a te: tasse, spese e mesi senza inquilino. Il valore proposto, ' + costiBase + '%, somma cedolare secca del ' +
        U.pct(AF.cedolareLibero.aliquota, 0) + ', ' + AF.ipotesi.mesiSfitto + (AF.ipotesi.mesiSfitto === 1 ? ' mese' : ' mesi') + ' senza inquilino all\'anno e spese pari al ' +
        U.pct(AF.ipotesi.speseProprietario, 0) + ' del canone. L\'IMU non è compresa.';
    }
    var conc = $('#stConc'), out = $('#stConcOut');
    function cursore() { out.textContent = conc.value + '%'; conc.style.setProperty('--p', ((conc.value - conc.min) / (conc.max - conc.min) * 100) + '%'); }
    conc.addEventListener('input', cursore);
    try { var p = JSON.parse(localStorage.getItem(K_PROFILO) || 'null'); if (p) {
      ['capitale', 'mutuo', 'orizzonteMesi', 'strategia', 'prudenza'].forEach(function (k) { var el = $('#stForm [name="' + k + '"]'); if (el && p[k] != null && p[k] !== 0) el.value = p[k]; });
      if (p.regioni && p.regioni[0]) $('#stRegione').value = p.regioni[0];
      if (p.concorrenza) conc.value = Math.round(p.concorrenza * 100);
    } } catch (e) {}
    try { var a = (JSON.parse(localStorage.getItem(K_PROFILO) || 'null') || {}).suPiuAnni; if (a) {
      ['anni', 'mesiRivendita'].forEach(function (k) { if (a[k] != null) f.elements[k].value = a[k]; });
      ['rivalutazione', 'costiAffitto', 'costiVendita', 'tassoMutuo'].forEach(function (k) { if (a[k] != null) f.elements[k].value = cento(a[k]); });
      f.elements.reinvesti.checked = !!a.reinvesti;
    } } catch (e) {}
    cursore();
    aggiornaCampi();
    f.addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(attesa); daRifare = null; calcola(); });
    function cambio(e) {
      var nome = e.target && e.target.name;
      if (!nome) return;
      if (nome === 'strategia' || nome === 'mutuo') aggiornaCampi();
      programma(nome);
    }
    f.addEventListener('input', cambio);
    f.addEventListener('change', function (e) { if (e.target && (e.target.type === 'checkbox' || e.target.tagName === 'SELECT')) cambio(e); });
    // il grafico segue la larghezza dello schermo
    var attesaR = null;
    window.addEventListener('resize', function () {
      clearTimeout(attesaR);
      attesaR = setTimeout(function () { if (grafico && grafico.wrap.isConnected && Math.floor(grafico.wrap.clientWidth) !== grafico.larghezza) disegnaGrafico(); }, 150);
    });
    // un tocco fuori dal grafico chiude i numeri dell'anno
    document.addEventListener('pointerdown', function (e) { if (grafico && !grafico.wrap.contains(e.target)) grafico.nascondi(); });
    caricaAste();
    if (+$('#stForm [name="capitale"]').value > 0) calcola();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
