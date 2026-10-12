/* Archivio delle aste.
 * Due origini, mai dati inventati:
 *   1. "raccolte"  → data/aste.js, scritto dal programma di raccolta dalle fonti ufficiali (sola lettura);
 *   2. "manuali"   → aste che l'utente copia da un avviso reale, con link obbligatorio (localStorage).
 * Le aste seguite (note, stato, valutazione) sono salvate in localStorage.
 * Usa Esporta/Importa per backup o per passare a un altro dispositivo. */
(function (root) {
  'use strict';
  var K_ASTE = 'radaraste.v1.aste', K_SEGUITE = 'radaraste.v1.seguite';
  var memoria = {};

  function leggi(k, def) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : def; }
    catch (e) { return memoria[k] !== undefined ? memoria[k] : def; }
  }
  function scrivi(k, v) {
    memoria[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function nuovoId() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var CAMPI = ['titolo','categoria','tipo','regione','provincia','comune','indirizzo','tribunale','rge','fonte','prezzoBase','offertaMinima','dataAsta','ora','stato','linkAvviso','linkPerizia','linkPdf','valoreMercato','lat','lng','descrizione','altriLink'];
  var NUMERICI = { prezzoBase: 1, offertaMinima: 1, valoreMercato: 1, lat: 1, lng: 1 };

  function dataIso(v) {
    var m = String(v).match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : String(v).slice(0, 10);
  }

  function normalizza(a, origine) {
    var o = { id: a.id || nuovoId(), origine: origine || a.origine || 'manuale', creata: a.creata || new Date().toISOString() };
    if (a.raccolta) o.raccolta = a.raccolta;
    CAMPI.forEach(function (c) {
      var v = a[c];
      if (v === undefined || v === null || v === '') return;
      if (NUMERICI[c]) { var n = typeof v === 'number' ? v : (root.Parser ? root.Parser.numeroIt(v) : parseFloat(v)); if (isFinite(n)) o[c] = n; }
      else if (c === 'dataAsta') o[c] = dataIso(v);
      else if (Array.isArray(v)) o[c] = v;
      else o[c] = String(v).trim();
    });
    if (!o.categoria) o.categoria = 'immobile';
    if (!o.stato) o.stato = 'nd';
    if (o.provincia) o.provincia = o.provincia.toUpperCase();
    if (!o.regione && o.provincia && root.GEO && root.GEO.province[o.provincia]) o.regione = root.GEO.province[o.provincia].regione;
    return o;
  }

  // Un'asta è accettata solo se ha il link all'avviso originale (http/https).
  function valida(a) {
    if (!a || !/^https?:\/\//i.test(a.linkAvviso || '')) return 'manca il link all\'avviso originale';
    if (!a.titolo) return 'manca il titolo';
    return null;
  }

  // Il file raccolto usa un formato compatto { campi: [...], righe: [[...], ...] }; si accetta anche { aste: [...] }.
  // Le aste raccolte possono essere decine di migliaia: si convertono una volta sola.
  var cacheRaccolte = null;
  function raccolte() {
    if (cacheRaccolte) return cacheRaccolte;
    var R = root.ASTE_RACCOLTE, lista = [];
    if (R && Array.isArray(R.righe) && Array.isArray(R.campi)) {
      var c = R.campi;
      lista = R.righe.map(function (r) { var o = {}; for (var i = 0; i < c.length; i++) if (r[i] !== null && r[i] !== undefined) o[c[i]] = r[i]; return o; });
    } else if (R && Array.isArray(R.aste)) lista = R.aste;
    cacheRaccolte = lista.filter(function (a) { return !valida(a); }).map(function (a) {
      var o = normalizza(a, 'raccolta'); o.creata = R.aggiornato || ''; return o;
    });
    return cacheRaccolte;
  }
  var indice = null;
  function perId(id) {
    if (!indice) { indice = {}; raccolte().forEach(function (a) { indice[a.id] = a; }); }
    return indice[id] || manuali().filter(function (a) { return a.id === id; })[0] || null;
  }
  function manuali() { return leggi(K_ASTE, []); }

  var Store = {
    campi: CAMPI,
    normalizza: normalizza,
    valida: valida,
    // stato della raccolta; senza data/aste.js si mostrano le fonti verificate in config/fonti.js
    infoRaccolta: function () {
      return root.ASTE_RACCOLTE || { aggiornato: null, righe: [], fonti: (root.FONTI || []).map(function (f) {
        return { nome: f.nome, url: f.url, stato: f.stato === 'attiva' ? 'non-raccolta' : f.stato, motivo: f.motivo, metodo: f.metodo, controllo: f.verificato };
      }) };
    },
    idSeguite: function () { var o = {}; Store.seguite().forEach(function (s) { o[s.id] = s; }); return o; },
    aste: function () { return raccolte().concat(manuali()); },
    asta: function (id) { return perId(id); },
    aggiungi: function (a) {
      var n = normalizza(a, 'manuale'), err = valida(n);
      if (err) throw new Error('Asta non salvata: ' + err + '.');
      var l = manuali(); l.push(n); scrivi(K_ASTE, l); return n;
    },
    aggiorna: function (id, patch) {
      var l = manuali(), trovata = false;
      l = l.map(function (a) {
        if (a.id !== id) return a;
        trovata = true;
        var m = {}; for (var k in a) m[k] = a[k]; for (var j in patch) m[j] = patch[j];
        var n = normalizza(m, 'manuale'); n.id = id;
        var err = valida(n); if (err) throw new Error('Modifica non salvata: ' + err + '.');
        return n;
      });
      if (!trovata) throw new Error('Le aste raccolte dalle fonti non si possono modificare.');
      scrivi(K_ASTE, l);
    },
    rimuovi: function (id) {
      scrivi(K_ASTE, manuali().filter(function (a) { return a.id !== id; }));
      scrivi(K_SEGUITE, Store.seguite().filter(function (s) { return s.id !== id; }));
    },
    // importa aste manuali (CSV/JSON): scarta quelle senza link all'avviso
    importa: function (lista) {
      var l = manuali(), byId = {}; l.forEach(function (a, i) { byId[a.id] = i; });
      var ok = 0, scartate = 0;
      lista.forEach(function (a) {
        var x = normalizza(a, 'manuale');
        if (valida(x)) { scartate++; return; }
        if (a.id && byId[a.id] !== undefined) l[byId[a.id]] = x; else l.push(x);
        ok++;
      });
      scrivi(K_ASTE, l); return { importate: ok, scartate: scartate };
    },

    seguite: function () { return leggi(K_SEGUITE, []); },
    seguita: function (id) { return Store.seguite().filter(function (s) { return s.id === id; })[0] || null; },
    segui: function (id, dati) {
      var l = Store.seguite(), s = l.filter(function (x) { return x.id === id; })[0];
      if (!s) { s = { id: id, stato: 'da-valutare', note: '', aggiunta: new Date().toISOString() }; l.push(s); }
      // copia dell'asta, così resta visibile anche se sparisce dal file delle aste raccolte
      var a = Store.asta(id); if (a) s.copia = a;
      if (dati) for (var k in dati) s[k] = dati[k];
      scrivi(K_SEGUITE, l); return s;
    },
    smetti: function (id) { scrivi(K_SEGUITE, Store.seguite().filter(function (s) { return s.id !== id; })); },

    backup: function () { return { app: 'Radar Aste Italia', versione: 1, esportato: new Date().toISOString(), aste: manuali(), seguite: Store.seguite() }; },
    ripristina: function (dati) {
      if (!dati || !Array.isArray(dati.aste)) throw new Error('File non valido: manca l\'elenco "aste".');
      var esito = Store.importa(dati.aste);
      if (Array.isArray(dati.seguite)) {
        var l = Store.seguite(), ids = {}; l.forEach(function (s) { ids[s.id] = s; });
        dati.seguite.forEach(function (s) { if (ids[s.id]) Object.assign(ids[s.id], s); else l.push(s); });
        scrivi(K_SEGUITE, l);
      }
      return esito;
    },
    persistente: function () { try { localStorage.setItem('radaraste.test', '1'); localStorage.removeItem('radaraste.test'); return true; } catch (e) { return false; } }
  };

  root.Store = Store;
})(window);
