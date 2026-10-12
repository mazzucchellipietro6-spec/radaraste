/* Service worker di Radar Aste Italia: il sito si apre subito e funziona anche offline.
 * - struttura (pagine, stili, script): dalla cache, aggiornata in background;
 * - dati delle aste (data/aste.js): prima la rete (dati del giorno), la cache solo se manca la connessione. */
var VERSIONE = 'radaraste-__VERSIONE__';
var STRUTTURA = [
  './', 'index.html', 'aste.html', 'mappa.html', 'calcolatore.html', 'mie-aste.html', 'tariffe.html', 'fonti.html',
  'assets/css/style.css', 'assets/icon.svg', 'assets/fonts/archivo.woff2', 'assets/fonts/hanken-grotesk.woff2', 'assets/fonts/martian-mono.woff2', 'js/icone.js', 'js/schede.js', 'js/confronto.js', 'js/ricerche.js', 'js/riepilogo.js', 'assets/icon-192.png', 'assets/vendor/leaflet/leaflet.js', 'assets/vendor/leaflet/leaflet.css',
  'config/tariffe.js', 'config/fonti.js', 'data/geo.js', 'data/italia.js',
  'js/ui.js', 'js/store.js', 'js/formato.js', 'js/calcoli.js', 'js/parser.js', 'js/estrai.js'
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
  var dati = /\/data\/(aste|riepilogo)\.js$/.test(new URL(req.url).pathname);
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
