/* Ricerche salvate e visite: cosa è nuovo dall'ultima volta.
 * Tutto resta nel browser (localStorage). Un'asta è "nuova" rispetto a una data se è stata
 * pubblicata (data della fonte) o trovata dalla raccolta per la prima volta dopo quella data. */
(function (root) {
  'use strict';
  var K_RICERCHE = 'radaraste.ricerche', K_VISITA = 'radaraste.visita', K_PRECEDENTE = 'radaraste.visitaPrecedente';
  var oggi = new Date().toISOString().slice(0, 10);

  function leggi(k, def, mem) { try { var s = (mem || localStorage).getItem(k); return s ? JSON.parse(s) : def; } catch (e) { return def; } }
  function scrivi(k, v, mem) { try { (mem || localStorage).setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Data della visita precedente: fissata all'inizio della sessione, così le evidenze restano mentre si naviga.
  var precedente = leggi(K_PRECEDENTE, null, sessionStorage);
  if (precedente === null) {
    precedente = leggi(K_VISITA, '');
    scrivi(K_PRECEDENTE, precedente, sessionStorage);
  }
  scrivi(K_VISITA, oggi);

  function nuovaDa(a, data) {
    if (!data) return false;
    var d = a.pubblicata || a.vista || (a.creata || '').slice(0, 10);
    return !!d && d > data;
  }

  var Ricerche = {
    visitaPrecedente: function () { return precedente; },
    nuova: function (a) { return nuovaDa(a, precedente); },
    nuovaDa: nuovaDa,
    tutte: function () { return leggi(K_RICERCHE, []); },
    salva: function (nome, filtri) {
      var l = Ricerche.tutte();
      var r = { id: 'r' + Date.now().toString(36), nome: String(nome).trim().slice(0, 60), filtri: JSON.parse(JSON.stringify(filtri)), creata: oggi, ultimaApertura: oggi };
      l.push(r); scrivi(K_RICERCHE, l); return r;
    },
    rimuovi: function (id) { scrivi(K_RICERCHE, Ricerche.tutte().filter(function (r) { return r.id !== id; })); },
    // chiamata quando l'utente apre la ricerca: restituisce la data precedente (per evidenziare) e aggiorna
    apri: function (id) {
      var l = Ricerche.tutte(), r = l.filter(function (x) { return x.id === id; })[0];
      if (!r) return null;
      var prima = r.ultimaApertura; r.ultimaApertura = oggi; scrivi(K_RICERCHE, l);
      return { ricerca: r, dal: prima };
    }
  };
  root.Ricerche = Ricerche;
})(window);
