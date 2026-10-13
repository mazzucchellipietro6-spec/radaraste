/* Service worker di Radar Aste Italia: il sito si apre subito e funziona anche offline.
 * - struttura (pagine, stili, script): dalla cache, aggiornata in background;
 * - dati delle aste (data/aste.js, data/riepilogo.js, data/dettagli/): prima la rete (dati del giorno), la cache solo se manca la connessione. */
var VERSIONE = 'radaraste-__VERSIONE__';
var STRUTTURA = [
  './', 'index.html', 'aste.html', 'mappa.html', 'calcolatore.html', 'mie-aste.html', 'tariffe.html', 'fonti.html', 'scheda.html', 'confronta.html',
  'manifest.webmanifest', 'assets/css/style.css', 'assets/css/pagine.css', 'assets/css/mappa.css', 'assets/icon.svg', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
  'assets/fonts/archivo.woff2', 'assets/fonts/hanken-grotesk.woff2', 'assets/fonts/martian-mono.woff2',
  'assets/vendor/leaflet/leaflet.js', 'assets/vendor/leaflet/leaflet.css', 'assets/vendor/supercluster/supercluster.min.js',
  'config/tariffe.js', 'config/fonti.js', 'data/geo.js', 'data/italia.js',
  'js/ui.js', 'js/store.js', 'js/formato.js', 'js/calcoli.js', 'js/parser.js', 'js/estrai.js', 'js/punteggio.js', 'js/dettagli.js',
  'js/icone.js', 'js/schede.js', 'js/confronto.js', 'js/asta.js', 'js/ricerche.js', 'js/riepilogo.js', 'js/cerca.js',
  'js/pages/home.js', 'js/pages/aste.js', 'js/pages/mappa.js', 'js/pages/calcolatore.js', 'js/pages/mie-aste.js', 'js/pages/tariffe.js', 'js/pages/fonti.js',
  'js/pages/scheda.js', 'js/pages/confronta.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSIONE).then(function (c) {
    // una pagina mancante non deve bloccare l'installazione
    return Promise.all(STRUTTURA.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nomi) {
    return Promise.all(nomi.filter(function (n) { return n !== VERSIONE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // anche le schede a pezzi (data/dettagli/XX.js): cambiano a ogni raccolta
  var dati = /\/data\/(aste|riepilogo|dettagli\/[0-9a-f]{2})\.js$/.test(new URL(req.url).pathname);
  if (dati) {
    e.respondWith(fetch(req).then(function (r) {
      var copia = r.clone(); caches.open(VERSIONE).then(function (c) { c.put(req, copia); }); return r;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (inCache) {
    var rete = fetch(req).then(function (r) {
      if (r.ok) { var copia = r.clone(); caches.open(VERSIONE).then(function (c) { c.put(req, copia); }); }
      return r;
    }).catch(function () { return inCache; });
    return inCache || rete;
  }));
});
