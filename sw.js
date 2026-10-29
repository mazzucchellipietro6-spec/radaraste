/* Service worker di Radar Aste Italia: il sito si apre subito e funziona anche offline.
 * - struttura (pagine, stili, script): dalla cache, aggiornata in background;
 * - dati del giorno (data/aste.js, riepilogo, affari, combinazioni, statistiche, data/dettagli/): prima la rete (dati del giorno), la cache solo se manca la connessione. */
var VERSIONE = 'radaraste-__VERSIONE__';
var STRUTTURA = [
  './', 'index.html', 'aste.html', 'scheda.html', 'mappa.html', 'radar3d.html',
  'assistenti.html', 'affari.html', 'consulente.html', 'stratega.html', 'combinazioni.html', 'arricchimento.html',
  'strumenti.html', 'calcolatore.html', 'mutuo.html', 'confronta.html', 'guida.html', 'tariffe.html', 'fonti.html', 'mie-aste.html',
  'prezzi.html', 'accedi.html', 'account.html', 'termini.html', 'privacy.html', 'cookie.html', 'recesso.html', 'avvertenze.html',
  'manifest.webmanifest', 'assets/css/style.css', 'assets/css/pagine.css', 'assets/css/mappa.css', 'assets/css/radar3d.css', 'assets/css/assistenti.css', 'assets/css/affari.css', 'assets/css/abbonamenti.css', 'assets/css/account.css',
  'assets/icon.svg', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
  'assets/fonts/source-serif-4.woff2', 'assets/fonts/source-serif-4-italic.woff2', 'assets/fonts/inter.woff2',
  'assets/vendor/leaflet/leaflet.js', 'assets/vendor/leaflet/leaflet.css', 'assets/vendor/supercluster/supercluster.min.js',
  'config/tariffe.js', 'config/fonti.js', 'config/consulente.js', 'config/abbonamenti.js', 'data/geo.js', 'data/italia.js',
  'js/ui.js', 'js/store.js', 'js/formato.js', 'js/calcoli.js', 'js/parser.js', 'js/estrai.js', 'js/punteggio.js', 'js/dettagli.js',
  'js/icone.js', 'js/schede.js', 'js/confronto.js', 'js/asta.js', 'js/ricerche.js', 'js/riepilogo.js', 'js/cerca.js',
  'js/agenti.js', 'js/cacciatore.js', 'js/affari.js', 'js/combinazioni.js', 'js/consulente.js', 'js/stratega.js', 'js/mutuo.js', 'js/calendario.js',
  'js/omi.js', 'js/scheda-dati.js', 'js/calore.js', 'js/radar3d-dati.js', 'js/piani.js', 'js/account.js',
  'js/pages/home.js', 'js/pages/aste.js', 'js/pages/scheda.js', 'js/pages/mappa.js', 'js/pages/radar3d.js',
  'js/pages/assistenti.js', 'js/pages/affari.js', 'js/pages/consulente.js', 'js/pages/stratega.js', 'js/pages/combinazioni.js', 'js/pages/arricchimento.js',
  'js/pages/strumenti.js', 'js/pages/calcolatore.js', 'js/pages/mutuo.js', 'js/pages/confronta.js', 'js/pages/guida.js', 'js/pages/tariffe.js', 'js/pages/fonti.js', 'js/pages/mie-aste.js',
  'js/pages/prezzi.js', 'js/pages/accedi.js', 'js/pages/account.js'
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
  var dati = /\/data\/(aste|riepilogo|affari|combinazioni|statistiche|dettagli\/[0-9a-f]{2})\.js$/.test(new URL(req.url).pathname);
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
