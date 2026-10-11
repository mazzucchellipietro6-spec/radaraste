/* Pagina "Tariffe e tasse": mostra il contenuto di config/tariffe.js con fonti e date. */
(function () {
  'use strict';
  var T = window.TARIFFE, U = window.UI, G = window.GEO, C = window.Calcoli, $ = U.$;
  var p = function (f, d) { return U.pct(f, d == null ? 2 : d); };

  function fonte(o) {
    if (!o) return '';
    return (o.url ? '<a href="' + U.esc(o.url) + '" target="_blank" rel="noopener">' + U.esc(o.fonte || o.url) + '</a>' : U.esc(o.fonte || '')) +
      '<br>Verificato il ' + U.dataIt(o.verificato) + ' ' + U.badgeStato(o.stato);
  }
  function voce(def) {
    if (!def) return '—';
    if (def.fissa != null) return U.eur(def.fissa) + ' fissa';
    return p(def.aliquota, 1) + (def.minimo ? ' (min. ' + U.eur(def.minimo) + ')' : '');
  }
  function tabella(id, intest, righe) {
    $('#' + id).innerHTML = '<thead><tr>' + intest.map(function (h) { return '<th' + (h[1] ? ' class="num"' : '') + '>' + h[0] + '</th>'; }).join('') + '</tr></thead><tbody>' +
      righe.map(function (r) { return '<tr>' + r.map(function (c, i) { var h = intest[i]; return '<td data-label="' + U.esc(h[0]) + '"' + (h[1] ? ' class="num"' : h[2] ? ' class="src"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#intro').innerHTML = 'Aliquote aggiornate al <b>' + U.dataIt(T.aggiornamento, true) + '</b>. Si modificano tutte in un unico file, <code>config/tariffe.js</code>. ' +
      U.badgeStato('confermato') + ' = riscontrata su fonte ufficiale · ' + U.badgeStato('da-verificare') + ' = riscontrata solo su fonti secondarie o valore predefinito: controllala prima di usarla.';

    // Immobili
    var gruppo = '';
    tabella('tabRegimi', [['Caso'], ['Registro', 1], ['Ipotecaria', 1], ['Catastale', 1], ['IVA', 1], ['Fonte', 0, 1]],
      T.immobili.regimi.map(function (r) {
        var nome = '<b>' + U.esc(r.gruppo) + '</b><br>' + U.esc(r.nome) + (r.nota ? '<br><span class="muted" style="font-size:12.5px">' + U.esc(r.nota) + '</span>' : '');
        gruppo = r.gruppo;
        return [nome, voce(r.registro), voce(r.ipotecaria), voce(r.catastale), r.iva ? p(r.iva, 0) : '—', fonte(r)];
      }));

    // Prezzo-valore
    var PV = T.immobili.prezzoValore;
    $('#pv').innerHTML = '<p style="margin:0 0 8px"><b>' + U.esc(PV.formula) + '</b></p><p style="margin:0 0 8px">' + U.esc(PV.quandoSiApplica) + '</p><p class="note">' + fonte(PV) + '</p>';
    $('#pvRendita').addEventListener('input', function () {
      var r = parseFloat(this.value) || 0;
      $('#pvOut').innerHTML = r ? '<div class="line"><span>Valore catastale prima casa (× 110)</span><b>' + U.eur(C.valoreCatastale(r, PV.coeffPrimaCasa, T)) + '</b></div>' +
        '<div class="line"><span>Valore catastale altre abitazioni (× 120)</span><b>' + U.eur(C.valoreCatastale(r, PV.coeffAltreAbitazioni, T)) + '</b></div>' : '';
    });

    // Asta
    var A = T.asta;
    tabella('tabAsta', [['Regola'], ['Valore', 1], ['Fonte', 0, 1]], [
      ['Offerta minima<br><span class="muted" style="font-size:12.5px">' + U.esc(A.offertaMinima.nota) + '</span>', p(A.offertaMinima.quota, 0) + ' del prezzo base', fonte(A.offertaMinima)],
      ['Cauzione<br><span class="muted" style="font-size:12.5px">' + U.esc(A.cauzione.nota) + '</span>', p(A.cauzione.quota, 0) + ' dell\'offerta', fonte(A.cauzione)],
      ['Debiti condominiali a carico dell\'aggiudicatario<br><span class="muted" style="font-size:12.5px">' + U.esc(A.condominio.nota) + '</span>', A.condominio.anni + ' anni di gestione', fonte(A.condominio)],
      ['Giudizio "Conviene?"<br><span class="muted" style="font-size:12.5px">Sconto = (valore di mercato − costo totale) / valore di mercato</span>',
        'Affare ≥ ' + p(T.giudizio.affare, 0) + '<br>Conviene ≥ ' + p(T.giudizio.conviene, 0) + '<br>Margine stretto ≥ ' + p(T.giudizio.margineStretto, 0), 'Soglie scelte per Radar Aste Italia']
    ]);

    // IMU e TARI
    var I = T.imu;
    $('#imuTesto').innerHTML = '<p style="margin:0 0 8px">' + U.esc(I.nota) + '</p>' +
      '<div class="line"><span>Aliquota di base</span><b>' + p(I.aliquotaBase) + '</b></div>' +
      '<div class="line"><span>Aliquota massima</span><b>' + p(I.aliquotaMassima) + '</b></div>' +
      '<div class="line"><span>Massima per i comuni con ex maggiorazione TASI</span><b>' + p(I.aliquotaMassimaExTasi) + '</b></div>' +
      '<p class="note">' + fonte(I) + '</p>' +
      '<p class="note">Aliquota del tuo comune: cercala nel <a href="' + U.esc(I.ricercaComune.url) + '" target="_blank" rel="noopener">' + U.esc(I.ricercaComune.fonte) + '</a> e aggiungila alla lista <code>imu.comuni</code> del file di configurazione.</p>' +
      '<h3 style="margin-top:16px">TARI</h3><p style="margin:0">' + U.esc(T.tari.nota) + '</p><p class="note">' + fonte(T.tari) + '</p>';
    tabella('tabImu', [['Comune'], ['Aliquota "altri fabbricati" 2026', 1], ['Fonte', 0, 1]],
      I.comuni.map(function (c) { return [U.esc(c.comune + ' (' + c.provincia + ')'), p(c.aliquota), fonte({ fonte: 'Prospetto aliquote IMU 2026 – MEF', url: c.url, verificato: c.verificato, stato: c.stato })]; }));

    // Plusvalenza
    var PL = T.plusvalenza;
    $('#plusvalenza').innerHTML = '<h2>Plusvalenza se rivendi entro ' + PL.anni + ' anni</h2><p style="margin:0 0 8px">' + U.esc(PL.nota) + '</p>' +
      '<div class="line"><span>Imposta sostitutiva (facoltativa, al rogito)</span><b>' + p(PL.aliquotaSostitutiva, 0) + '</b></div><p class="note">' + fonte(PL) + '</p>';

    // Veicoli
    var V = T.veicoli, P = V.passaggio;
    tabella('tabVeicoli', [['Voce'], ['Importo', 1], ['Fonte', 0, 1]], [
      ['Emolumenti ACI (PRA)', U.eur(P.emolumentiAci.importo, 2), fonte(P.emolumentiAci)],
      ['Imposta di bollo (istanza unificata)', U.eur(P.bolloIstanzaUnificata.importo, 2), fonte(P.bolloIstanzaUnificata)],
      ['Diritti Motorizzazione', U.eur(P.dirittiMotorizzazione.importo, 2), fonte(P.dirittiMotorizzazione)],
      ['Diritti d\'asta (buyer\'s premium)<br><span class="muted" style="font-size:12.5px">' + U.esc(V.dirittiAsta.nota) + '</span>', p(V.dirittiAsta.quota, 0) + ' + IVA ' + p(V.dirittiAsta.ivaSuDiritti, 0), fonte(V.dirittiAsta)],
      ['IVA sul prezzo (se il venditore è un\'impresa)', p(V.ivaOrdinaria.aliquota, 0), fonte(V.ivaOrdinaria)]
    ]);

    // IPT
    var IP = V.ipt;
    $('#iptTesto').innerHTML = '<div class="line"><span>Fino a 53 kW</span><b>' + U.eur(IP.fissaFinoA53kW, 2) + '</b></div>' +
      '<div class="line"><span>Oltre 53 kW (per ogni kW, su tutta la potenza)</span><b>' + U.eur(IP.perKwOltre53, 4) + '</b></div>' +
      '<div class="line"><span>Maggiorazione provinciale massima</span><b>' + p(IP.maggiorazioneMassima, 0) + '</b></div>' +
      '<p class="note">' + U.esc(IP.notaIva) + ' ' + U.esc(IP.notaMoto) + '</p><p class="note">' + fonte(IP) + '</p>' +
      '<p class="note">Le province contrassegnate "da verificare" usano la maggiorazione predefinita del ' + p(IP.maggiorazionePredefinita, 0) + ', applicata dalla maggior parte delle province. Province verificate: <a href="' + U.esc(IP.urlProvince) + '" target="_blank" rel="noopener">' + U.esc(IP.fonteProvince) + '</a>.</p>';
    U.opzioniRegioni($('#iptRegione'), true);
    function renderIpt() {
      var reg = $('#iptRegione').value;
      tabella('tabIpt', [['Provincia'], ['Maggiorazione', 1], ['IPT 70 kW', 1], ['IPT 100 kW', 1], ['Stato']],
        G.provinceDi(reg).map(function (pr) {
          var m = C.ipt({ kw: 70, provincia: pr.sigla }, T);
          return [U.esc(pr.nome) + ' (' + pr.sigla + ')<br><span class="muted" style="font-size:12.5px">' + U.esc(pr.regione) + '</span>', '+' + p(m.maggiorazione, 0), U.eur(m.importo), U.eur(C.ipt({ kw: 100, provincia: pr.sigla }, T).importo), U.badgeStato(m.statoMaggiorazione)];
        }));
    }
    $('#iptRegione').addEventListener('change', renderIpt); renderIpt();

    // Bollo
    var B = V.bollo;
    $('#bolloTesto').innerHTML = '<p style="margin:0 0 8px">' + U.esc(B.nota) + '</p><p class="note" style="margin:0">' + fonte({ fonte: B.fonte, url: B.url, verificato: B.verificato, stato: 'confermato' }) + '</p>' +
      '<h3 style="margin-top:14px">Superbollo</h3><p style="margin:0">' + U.eur(B.superbollo.perKw) + ' per ogni kW oltre ' + B.superbollo.sogliaKw + ' kW; ridotto al ' +
      B.superbollo.riduzioni.map(function (r) { return p(r.quota, 0) + ' dopo ' + r.dopoAnni + ' anni'; }).join(', ') + '. ' + U.esc(B.superbollo.nota) + '</p><p class="note">' + fonte(B.superbollo) + '</p>';
    tabella('tabBollo', [['Classe'], ['€/kW fino a 100 kW', 1], ['€/kW oltre 100 kW', 1], ['Bollo 70 kW', 1], ['Stato']],
      Object.keys(B.tariffeNazionali).map(function (k) {
        var t = B.tariffeNazionali[k];
        return [k, U.eur(t.fino100, 2), U.eur(t.oltre100, 2), U.eur(C.bolloAuto({ kw: 70, euro: k, regione: '' }, T).bollo, 2), U.badgeStato(t.stato)];
      }));
    tabella('tabRegioni', [['Regione'], ['Variazione sulla tariffa nazionale', 1], ['Nota'], ['Stato']],
      G.regioni.map(function (r) {
        var x = B.regioni[r];
        return [U.esc(r), x ? (x.coefficiente >= 1 ? '+' : '') + p(x.coefficiente - 1, 0) : 'nessuna registrata', x ? U.esc(x.nota) : 'Usata la tariffa nazionale: verifica con il calcolo bollo ACI.', U.badgeStato(x ? x.stato : 'da-verificare')];
      }));
  });
})();
