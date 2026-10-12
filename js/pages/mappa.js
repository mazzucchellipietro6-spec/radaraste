/* Pagina "Mappa": aste per provincia (capoluogo) o con coordinate precise. */
(function () {
  'use strict';
  var T = window.TARIFFE, U = window.UI, S = window.Store, G = window.GEO, $ = U.$, $$ = U.$$;
  var COLORI = { immobile: '#0d6b4f', auto: '#1f5fa8', moto: '#9a6700', beni: '#7a3fa8' };
  var mappa, filtroCat = '';

  function filtrate() {
    var oggi = new Date().toISOString().slice(0, 10);
    var soloSeg = $('#mSeguite').checked, passate = $('#mPassate').checked, seg = S.idSeguite();
    return S.aste().filter(function (a) {
      if (filtroCat && a.categoria !== filtroCat) return false;
      if (soloSeg && !seg[a.id]) return false;
      if (!passate && a.dataAsta && a.dataAsta < oggi) return false;
      return true;
    });
  }

  function voce(a) {
    var link = U.linkSicuro(a.linkAvviso);
    return '<li><b>' + U.esc(a.titolo) + '</b><br>' + U.esc(U.CATEGORIE[a.categoria]) + ' · ' + U.dataIt(a.dataAsta) + (a.prezzoBase ? ' · base ' + U.eur(a.prezzoBase) : '') +
      '<br>' + (link ? '<a href="' + U.esc(link) + '" target="_blank" rel="noopener">Avviso ↗</a> · ' : '') + '<a href="calcolatore.html?id=' + encodeURIComponent(a.id) + '" data-passa="id:' + U.esc(a.id) + '">Conviene?</a></li>';
  }

  var ZOOM_PROVINCE = 7, ZOOM_PUNTI = 10, MAX_PUNTI = 3000, correnti = [], gruppi = { prov: {}, reg: {} }, livello, rendererCanvas;

  // centro di ogni regione = media dei capoluoghi di provincia
  var CENTRI = {};
  G.regioni.forEach(function (r) {
    var pr = G.provinceDi(r), lat = 0, lng = 0;
    pr.forEach(function (p) { lat += p.lat; lng += p.lng; });
    CENTRI[r] = { lat: lat / pr.length, lng: lng / pr.length };
  });

  function bolla(lat, lng, n, titolo, popup) {
    var d = Math.round(24 + Math.min(22, Math.sqrt(n) * 1.1));
    var testo = n > 999 ? (Math.round(n / 100) / 10).toLocaleString('it-IT') + 'k' : n;
    L.marker([lat, lng], { icon: L.divIcon({ className: '', html: '<div class="map-count" style="width:' + d + 'px;height:' + d + 'px">' + testo + '</div>', iconSize: [d, d] }), title: titolo + ': ' + n + ' aste' })
      .bindPopup(popup).addTo(livello);
  }

  function elencoPopup(titolo, el, link) {
    return function () {
      var ord = el.slice().sort(function (a, b) { return (a.dataAsta || '').localeCompare(b.dataAsta || ''); });
      return '<h5>' + U.esc(titolo) + ' (' + el.length.toLocaleString('it-IT') + ')</h5><ul>' + ord.slice(0, 20).map(voce).join('') + '</ul>' +
        (el.length > 20 ? '<p><a href="' + link + '"' + (link.indexOf('provincia=') > 0 ? ' data-passa="provincia:' + link.split('provincia=')[1] + '"' : '') + '>Vedi tutte nell\'elenco →</a> o avvicina la mappa.</p>' : '');
    };
  }

  function render() {
    correnti = filtrate();
    var tutte = S.aste();
    gruppi = { prov: {}, reg: {} };
    var conCoord = 0, senza = [];
    correnti.forEach(function (a) {
      if (isFinite(a.lat) && isFinite(a.lng)) conCoord++;
      if (a.provincia && G.province[a.provincia]) {
        (gruppi.prov[a.provincia] = gruppi.prov[a.provincia] || []).push(a);
        var r = G.province[a.provincia].regione; (gruppi.reg[r] = gruppi.reg[r] || []).push(a);
      } else if (!(isFinite(a.lat) && isFinite(a.lng))) senza.push(a);
    });
    disegna();

    if (!tutte.length) {
      $('#mappaVuota').innerHTML = '<div class="panel empty"><h2>Nessuna asta da mostrare sulla mappa</h2><p>Non ci sono aste raccolte dalle fonti ufficiali né inserite da te. Qui non compaiono mai dati di esempio. <a href="fonti.html">Stato delle fonti</a> · <a href="aste.html#boxAggiungi">Aggiungi un\'asta da un avviso reale</a></p></div>';
    } else if (!correnti.length) {
      $('#mappaVuota').innerHTML = '<div class="panel empty">Nessuna asta corrisponde ai filtri scelti.</div>';
    } else $('#mappaVuota').innerHTML = '';

    $('#statoMappa').textContent = correnti.length ? correnti.length.toLocaleString('it-IT') + ' aste. Vista d\'insieme: numeri per regione; avvicinando la mappa: per provincia, poi (zoom ' + ZOOM_PUNTI + '+) i punti precisi delle ' + conCoord.toLocaleString('it-IT') + ' aste con coordinate.' : '';
    $('#senzaPosizione').innerHTML = senza.length ? '<div class="panel"><h3>Aste senza luogo riconosciuto (' + senza.length + ')</h3><ul class="tips" style="padding-left:18px">' + senza.slice(0, 100).map(voce).join('') + '</ul></div>' : '';

    var daGeo = correnti.filter(daGeocodificare);
    $('#geocodifica').hidden = !daGeo.length;
    $('#geocodifica').textContent = 'Posiziona con precisione le tue aste (' + daGeo.length + ')';
  }

  function disegna() {
    livello.clearLayers();
    var z = mappa.getZoom();
    if (z < ZOOM_PROVINCE) {
      Object.keys(gruppi.reg).forEach(function (r) {
        bolla(CENTRI[r].lat, CENTRI[r].lng, gruppi.reg[r].length, r, elencoPopup(r, gruppi.reg[r], 'aste.html'));
      });
    } else if (z < ZOOM_PUNTI) {
      Object.keys(gruppi.prov).forEach(function (sig) {
        var pr = G.province[sig];
        bolla(pr.lat, pr.lng, gruppi.prov[sig].length, pr.nome, elencoPopup('Provincia di ' + pr.nome, gruppi.prov[sig], 'aste.html?provincia=' + sig));
      });
    } else {
      var b = mappa.getBounds(), n = 0;
      for (var i = 0; i < correnti.length && n < MAX_PUNTI; i++) {
        var a = correnti[i];
        if (!(isFinite(a.lat) && isFinite(a.lng)) || !b.contains([a.lat, a.lng])) continue;
        n++;
        L.circleMarker([a.lat, a.lng], { renderer: rendererCanvas, radius: 7, color: '#fff', weight: 1.5, fillColor: COLORI[a.categoria] || '#555', fillOpacity: 0.9 })
          .bindPopup('<ul style="padding-left:0;list-style:none">' + voce(a) + '</ul>').addTo(livello);
      }
    }
  }

  function stileConfini() {
    var cs = getComputedStyle(document.documentElement);
    return { color: cs.getPropertyValue('--muted').trim() || '#5b6b65', weight: 1, opacity: 0.7,
      fillColor: cs.getPropertyValue('--accent-soft').trim() || '#e1efe9', fillOpacity: 0.45 };
  }

  // solo le aste inserite a mano si possono aggiornare con le coordinate
  function daGeocodificare(a) { return a.origine === 'manuale' && !(isFinite(a.lat) && isFinite(a.lng)) && (a.indirizzo || a.comune); }

  // Geocodifica con Nominatim (OpenStreetMap): massimo 1 richiesta al secondo, come da policy d'uso.
  function geocodifica() {
    var coda = correnti.filter(daGeocodificare), btn = $('#geocodifica'), ok = 0, i = 0;
    if (!coda.length) return;
    btn.disabled = true;
    (function prossima() {
      if (i >= coda.length) { btn.disabled = false; render(); U.toast('Posizionate ' + ok + ' aste su ' + coda.length); return; }
      var a = coda[i++];
      var q = [a.indirizzo, a.comune, a.provincia && G.province[a.provincia] ? G.province[a.provincia].nome : ''].filter(Boolean).join(', ');
      btn.textContent = 'Cerco ' + i + ' di ' + coda.length + '…';
      fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'it' } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (j) { if (j && j[0]) { S.aggiorna(a.id, { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) }); ok++; } })
        .catch(function () {})
        .then(function () { setTimeout(prossima, 1100); });
    })();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('#legenda').innerHTML = Object.keys(COLORI).map(function (k) { return '<span><span class="dot" style="background:' + COLORI[k] + '"></span>' + U.CATEGORIE[k] + '</span>'; }).join('') +
      '<span><span class="dot" style="background:var(--accent);border:2px solid var(--surface)"></span>Numero di aste per regione o provincia</span>';
    if (!window.L) {
      $('#map').innerHTML = '<div class="empty">Impossibile caricare la libreria della mappa (assets/vendor/leaflet).</div>';
      return;
    }
    mappa = L.map('map', { scrollWheelZoom: false }).setView([42.0, 12.6], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(mappa);
    rendererCanvas = L.canvas({ padding: 0.3 });
    // Confini regionali inclusi nel sito: la mappa resta leggibile anche se lo sfondo OpenStreetMap non si carica.
    if (window.ITALIA_REGIONI) {
      var confini = L.geoJSON(window.ITALIA_REGIONI, { interactive: false, style: stileConfini }).addTo(mappa);
      mappa.attributionControl.addAttribution('Confini: ISTAT (CC BY)');
      var ridisegna = function () { confini.setStyle(stileConfini); };
      document.addEventListener('radaraste:tema', ridisegna);
      try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ridisegna); } catch (e) {}
    }
    livello = L.layerGroup().addTo(mappa);
    mappa.on('moveend', disegna);
    render();
    $('#mCat').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return; filtroCat = b.dataset.cat;
      $$('#mCat .chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === b)); }); render();
    });
    $('#mSeguite').addEventListener('change', render);
    $('#mPassate').addEventListener('change', render);
    $('#geocodifica').addEventListener('click', geocodifica);
  });
})();
