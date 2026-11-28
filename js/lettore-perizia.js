/* Lettore della perizia nel browser (scheda dell'asta e pagina perizia.html).
 *
 * Scarica la perizia dal Portale delle Vendite Pubbliche (che ne permette la lettura da altri siti) oppure apre il PDF
 * scelto o trascinato, ne estrae il testo con pdf.js e chiede a js/perizia.js i punti critici. Il file non lascia mai il
 * computer: nessun invio a un server, nessun salvataggio (né del PDF né del risultato).
 * pdf.js (1,8 MB) si carica solo al primo uso, con js/pdfjs-carica.mjs; il codice dei PDF non viene mai eseguito
 * (isEvalSupported: false) e i caratteri del PDF non si installano (disableFontFace: per il testo non servono).
 *
 * LettorePerizia.blocco({ url })      → HTML del riquadro (pulsante "Leggi la perizia" se c'è l'indirizzo, scelta del file)
 * LettorePerizia.collega(el, { url }) → attiva il riquadro già nella pagina
 * LettorePerizia.html(risultato, opz) → HTML del resoconto (usato anche dai test) */
(function (root) {
  'use strict';
  var U = root.UI, P = root.Perizia;
  var MAX_PAGINE = 400, MAX_BYTE = 80 * 1024 * 1024;
  var caricando = null;

  function esc(s) { return U ? U.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icona(n, c) { return U && U.icona ? U.icona(n, c) : ''; }
  function num(n) { return Number(n).toLocaleString('it-IT'); }
  function eur(n) { return U && U.eur ? U.eur(n) : num(n) + ' €'; }
  function mb(b) { return (b / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB'; }

  /* ---------- pdf.js, al primo uso ---------- */
  function pdfjs() {
    if (root.pdfjsLib && root.pdfjsLib.getDocument) return Promise.resolve(root.pdfjsLib);
    if (caricando) return caricando;
    caricando = new Promise(function (ok, ko) {
      var finito = false, t = null;
      function fine(err) {
        if (finito) return;
        finito = true; clearTimeout(t); root.removeEventListener('radaraste:pdfjs', pronto);
        if (err) { caricando = null; ko(err); } else ok(root.pdfjsLib);
      }
      function pronto() { fine(root.pdfjsLib && root.pdfjsLib.getDocument ? null : new Error('pdf.js non valido')); }
      root.addEventListener('radaraste:pdfjs', pronto);
      var s = document.createElement('script');
      s.type = 'module'; s.src = 'js/pdfjs-carica.mjs';
      s.onerror = function () { fine(new Error('non riesco a caricare il lettore dei PDF')); };
      t = setTimeout(function () { fine(new Error('il lettore dei PDF non parte: il browser potrebbe essere troppo vecchio')); }, 25000);
      document.head.appendChild(s);
    });
    return caricando;
  }

  /* ---------- lettura ---------- */
  // perizia dal Portale: GET semplice (niente richieste parziali), così basta il permesso CORS che il Portale già dà
  function scarica(url, avanzamento) {
    return fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }).catch(function () {
      // rete assente, firewall del Portale o permesso negato: il browser non dice quale
      throw new Error('il Portale non ha risposto o non permette di scaricarla da qui');
    }).then(function (r) {
      if (!r.ok) throw new Error('il Portale risponde con l\'errore ' + r.status);
      if (/text\/html/i.test(r.headers.get('content-type') || '')) throw new Error('il Portale ha risposto con una pagina invece del PDF');
      var tot = Number(r.headers.get('content-length')) || 0;
      if (tot > MAX_BYTE) throw new Error('il file è di ' + mb(tot) + ', troppo grande da leggere qui');
      if (!r.body || !r.body.getReader) return r.arrayBuffer().then(function (b) { return new Uint8Array(b); });
      var lettore = r.body.getReader(), pezzi = [], letti = 0;
      function giro() {
        return lettore.read().then(function (x) {
          if (x.done) {
            var out = new Uint8Array(letti), i = 0;
            pezzi.forEach(function (p) { out.set(p, i); i += p.length; });
            return out;
          }
          pezzi.push(x.value); letti += x.value.length;
          if (letti > MAX_BYTE) { try { lettore.cancel(); } catch (e) {} throw new Error('il file supera ' + mb(MAX_BYTE)); }
          if (avanzamento) avanzamento('scarico', letti, tot);
          return giro();
        });
      }
      return giro();
    });
  }
  function daFile(file) {
    if (file.size > MAX_BYTE) return Promise.reject(new Error('il file è di ' + mb(file.size) + ', troppo grande da leggere qui'));
    if (file.arrayBuffer) return file.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onload = function () { ok(new Uint8Array(fr.result)); };
      fr.onerror = function () { ko(new Error('non riesco ad aprire il file')); };
      fr.readAsArrayBuffer(file);
    });
  }
  function testoPagina(tc) {
    var t = '';
    for (var i = 0; i < tc.items.length; i++) {
      var it = tc.items[i];
      if (typeof it.str !== 'string') continue;
      t += it.str;
      if (it.hasEOL) t += '\n';
    }
    return t;
  }
  // byte del PDF → { pagine: [testo...], totali }
  function estrai(dati, avanzamento, stato) {
    return pdfjs().then(function (lib) {
      var task = lib.getDocument({ data: dati, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, enableXfa: false, stopAtErrors: false });
      if (stato) stato.task = task;
      return task.promise.then(function (doc) {
        var n = Math.min(doc.numPages, MAX_PAGINE), pagine = [], i = 0;
        function prossima() {
          if (stato && stato.annullato) { doc.destroy(); throw new Error('lettura annullata'); }
          if (i >= n) { var tot = doc.numPages; doc.destroy(); return { pagine: pagine, totali: tot }; }
          i++;
          return doc.getPage(i).then(function (p) { return p.getTextContent(); }).then(function (tc) {
            pagine.push(testoPagina(tc));
            if (avanzamento) avanzamento('leggo', i, n);
            return prossima();
          });
        }
        return prossima();
      }, function (e) {
        var m = e && e.name === 'PasswordException' ? 'il PDF è protetto da password' : e && e.name === 'InvalidPDFException' ? 'il file non è un PDF valido' : 'non riesco ad aprire il PDF';
        throw new Error(m);
      });
    });
  }

  /* ---------- resoconto ---------- */
  var ORDINE = { problema: 0, info: 1, ok: 2, assente: 3 }, GRAVITA = { alta: 0, media: 1, bassa: 2, info: 3 };
  var ESITI = {
    problema: { testo: 'Da verificare', classe: 'rosso' },
    info: { testo: 'Costi indicati', classe: 'giallo' },
    ok: { testo: 'Rassicurante', classe: 'verde' },
    assente: { testo: 'Non trovato', classe: 'grigio' }
  };
  function linkPagina(opz, n) {
    var base = opz && opz.linkPdf;
    if (!base) return '<span class="lp-pag">pag. ' + n + '</span>';
    return '<a class="lp-pag" href="' + esc(base + '#page=' + n) + '" target="_blank" rel="noopener">pag. ' + n + '<span class="sr-only"> (apre la perizia in una nuova scheda)</span></a>';
  }
  function frase(v, opz) {
    return '<li><blockquote class="lp-frase">' + esc(v.testo) + '</blockquote><div class="lp-dove">' + linkPagina(opz, v.pagina) +
      (v.importo > 0 ? '<span class="lp-importo">' + eur(v.importo) + '</span>' : '') + '</div></li>';
  }
  function tema(t, opz) {
    var e = ESITI[t.esito], n = t.nProblemi, aperto = t.esito === 'problema' || t.esito === 'info';
    var conta = t.esito === 'problema' || t.esito === 'info' ? (n === 1 ? '1 punto' : num(n) + ' punti') : '';
    var h = '<details class="lp-tema lp-' + e.classe + '"' + (aperto ? ' open' : '') + '><summary>' +
      '<i class="lp-punto" aria-hidden="true"></i><span class="lp-titolo">' + esc(t.titolo) + '</span>' +
      '<span class="lp-esito">' + e.testo + (conta ? ' · ' + conta : '') + '</span></summary><div class="lp-corpo">';
    if (t.esito === 'problema' || t.esito === 'info') {
      h += '<ul class="lp-frasi">' + t.problemi.map(function (v) { return frase(v, opz); }).join('') + '</ul>';
      if (n > t.problemi.length) h += '<p class="note">Altre ' + num(n - t.problemi.length) + ' frasi sullo stesso tema nella perizia.</p>';
      if (t.importi && t.chiave !== 'condominio') h += '<p class="note">Somma degli importi citati in queste frasi: ' + eur(t.importi.somma) + ' (possono ripetersi o essere già tolti dal valore di stima: controlla nella perizia).</p>';
    } else if (t.esito === 'ok') {
      h += '<ul class="lp-frasi">' + t.ok.map(function (v) { return frase(v, opz); }).join('') + '</ul>';
    } else {
      h += '<p class="lp-assente">Nel testo non ho trovato frasi su questo tema. Cercalo nel ' + esc(t.dove) + ': la perizia può dirlo con parole diverse.</p>';
    }
    // anche con un problema, le frasi rassicuranti dello stesso tema (es. "libero" in un lotto e "occupato" in un altro)
    if (t.esito === 'problema' && t.ok.length) h += '<p class="lp-anche">Nello stesso tema la perizia dice anche:</p><ul class="lp-frasi lp-frasi-ok">' + t.ok.map(function (v) { return frase(v, opz); }).join('') + '</ul>';
    h += '<p class="lp-spiega">' + icona('guida') + '<span>' + esc(t.spiegazione) + '</span></p></div></details>';
    return h;
  }
  function cifre(c, opz) {
    var righe = [];
    c.valori.slice(0, 4).forEach(function (v) { righe.push(['Valore o prezzo', eur(v.importo), v]); });
    c.superfici.slice(0, 3).forEach(function (s) { righe.push(['Superficie', num(s.mq) + ' m²', s]); });
    if (c.classe) righe.push(['Classe energetica', esc(c.classe.classe), c.classe]);
    if (!righe.length) return '';
    return '<section class="lp-cifre" aria-labelledby="lpCifre"><h3 id="lpCifre">Numeri trovati nella perizia</h3><ul>' + righe.map(function (r) {
      return '<li><span class="lp-cifra-et">' + r[0] + '</span><b class="lp-cifra">' + r[1] + '</b><span class="lp-cifra-frase">«' + esc(r[2].testo) + '» · ' + linkPagina(opz, r[2].pagina) + '</span></li>';
    }).join('') + '</ul><p class="note">Se la perizia ha più lotti, ogni lotto ha i suoi numeri: controlla a quale si riferiscono.</p></section>';
  }
  function html(r, opz) {
    opz = opz || {};
    if (!r || !r.pagine) return '<div class="callout warn">' + icona('allerta') + ' Il PDF non ha pagine da leggere.</div>';
    if (r.scansione) {
      return '<div class="lp-scansione callout warn">' + icona('allerta') + '<div><b>Questa perizia è una scansione: pagine fotografate, senza testo da leggere.</b> ' +
        'Per leggerla servirebbe il riconoscimento del testo, che qui non c\'è. Aprila e cerca questi capitoli:<ul>' +
        r.temi.filter(function (t) { return t.gravita !== 'info'; }).map(function (t) { return '<li><b>' + esc(t.titolo) + '</b>: ' + esc(t.dove) + '</li>'; }).join('') +
        '</ul>' + (opz.linkPdf ? '<a class="btn ghost small" href="' + esc(opz.linkPdf) + '" target="_blank" rel="noopener">' + icona('documento') + 'Apri la perizia' + icona('esterno') + '</a>' : '') + '</div></div>';
    }
    var temi = r.temi.slice().sort(function (a, b) { return ORDINE[a.esito] - ORDINE[b.esito] || GRAVITA[a.gravita] - GRAVITA[b.gravita]; });
    var s = r.sintesi, letti = opz.totali && opz.totali > r.pagine ? 'le prime ' + num(r.pagine) + ' pagine su ' + num(opz.totali) : num(r.pagine) + (r.pagine === 1 ? ' pagina' : ' pagine');
    var testa = '<div class="lp-sintesi"><p class="lp-letto">' + icona('documento') + '<span>Ho letto ' + letti + (opz.nome ? ' di «' + esc(opz.nome) + '»' : '') + '.</span></p>' +
      '<div class="lp-conti">' +
        '<span class="lp-conto lp-rosso"><b>' + s.problemi + '</b> ' + (s.problemi === 1 ? 'tema da verificare' : 'temi da verificare') + '</span>' +
        '<span class="lp-conto lp-verde"><b>' + s.ok + '</b> ' + (s.ok === 1 ? 'rassicurante' : 'rassicuranti') + '</span>' +
        '<span class="lp-conto lp-grigio"><b>' + s.assenti + '</b> non ' + (s.assenti === 1 ? 'trovato' : 'trovati') + '</span>' +
      '</div></div>';
    return testa + '<div class="lp-temi">' + temi.map(function (t) { return tema(t, opz); }).join('') + '</div>' + cifre(r.cifre, opz) +
      '<p class="lp-avvertenza">' + icona('allerta') + '<span><b>Lettura automatica a parole chiave, affidabilità media.</b> Ogni punto riporta la frase esatta della perizia: rileggila nel suo contesto. ' +
      'Un tema "non trovato" non vuol dire che il problema non c\'è. Prima di offrire, leggi tutta la perizia e, se serve, fatti aiutare da un tecnico.</span></p>';
  }

  /* ---------- riquadro nella pagina ---------- */
  function blocco(opz) {
    opz = opz || {};
    return '<div class="lp" data-lp>' +
      '<div class="lp-azioni">' +
        (opz.url ? '<button class="btn" type="button" data-lp-leggi>' + icona('documento') + 'Leggi la perizia</button>' : '') +
        '<button class="btn ' + (opz.url ? 'ghost' : '') + '" type="button" data-lp-scegli>' + icona('scarica') + (opz.url ? 'Usa un altro PDF' : 'Scegli la perizia (PDF)') + '</button>' +
        '<input type="file" accept="application/pdf,.pdf" data-lp-file hidden>' +
      '</div>' +
      '<p class="lp-trascina" aria-hidden="true">oppure trascina qui il file</p>' +
      '<div class="lp-stato" role="status" aria-live="polite" data-lp-stato></div>' +
      '<div class="lp-risultato" data-lp-risultato tabindex="-1"></div>' +
      '<p class="note lp-privacy">' + icona('chiave') + ' La perizia si legge nel tuo browser: non viene inviata a nessun server e non viene salvata.</p>' +
    '</div>';
  }
  function collega(el, opz) {
    opz = opz || {};
    if (!el || el._lp) return;
    el._lp = true;
    var stato = null, urlFile = null;
    var $s = el.querySelector('[data-lp-stato]'), $r = el.querySelector('[data-lp-risultato]'), $f = el.querySelector('[data-lp-file]');
    function scrivi(t, cls) { $s.className = 'lp-stato' + (cls ? ' ' + cls : ''); $s.innerHTML = t; }
    function occupato(si) {
      el.classList.toggle('lp-in-corso', si);
      [].forEach.call(el.querySelectorAll('[data-lp-leggi],[data-lp-scegli]'), function (b) { b.disabled = si; });
    }
    function avanzamento(fase, a, b) {
      if (fase === 'scarico') scrivi('<span class="lp-giro" aria-hidden="true"></span>Scarico la perizia dal Portale: ' + mb(a) + (b ? ' di ' + mb(b) : '') + '…');
      else scrivi('<span class="lp-giro" aria-hidden="true"></span>Leggo la pagina ' + num(a) + ' di ' + num(b) + '…' +
        '<span class="lp-barra" aria-hidden="true"><i style="width:' + Math.round(a / b * 100) + '%"></i></span>');
    }
    function esegui(prendiDati, info) {
      if (stato) stato.annullato = true;
      var mio = stato = { annullato: false };
      occupato(true); $r.innerHTML = '';
      scrivi('<span class="lp-giro" aria-hidden="true"></span>Preparo il lettore dei PDF…');
      prendiDati().then(function (dati) {
        if (mio.annullato) return null;
        avanzamento('leggo', 0, 1);
        return estrai(dati, avanzamento, mio);
      }).then(function (x) {
        if (!x || mio.annullato) return;
        var r = P.analizza(x.pagine);
        scrivi('');
        $r.innerHTML = html(r, { linkPdf: info.linkPdf, nome: info.nome, totali: x.totali });
        try { $r.focus({ preventScroll: true }); } catch (e) {}
        if (opz.dopo) opz.dopo(r);
      }).catch(function (e) {
        if (mio.annullato) return;
        var msg = e && e.message ? e.message : 'errore sconosciuto';
        scrivi(icona('allerta') + '<span>Non sono riuscito a leggere la perizia: ' + esc(msg) + '.' +
          (info.daPortale ? ' Aprila con il link qui sotto, salvala e sceglila con «Usa un altro PDF»: la lettura è la stessa.' +
            '<br><a href="' + esc(opz.url) + '" target="_blank" rel="noopener">Apri la perizia sul Portale' + icona('esterno') + '</a>' : '') + '</span>', 'lp-errore');
      }).then(function () { if (stato === mio) occupato(false); });
    }
    function leggiFile(file) {
      if (!file) return;
      if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name || '')) { scrivi(icona('allerta') + '<span>Il file scelto non è un PDF.</span>', 'lp-errore'); return; }
      if (urlFile) { try { URL.revokeObjectURL(urlFile); } catch (e) {} }
      urlFile = null;
      // i link "pag. N" aprono il file sempre come PDF, qualunque tipo gli dia il sistema (anche vuoto)
      try { urlFile = URL.createObjectURL(new Blob([file], { type: 'application/pdf' })); } catch (e) {}
      esegui(function () { return daFile(file); }, { linkPdf: urlFile, nome: file.name });
    }
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-lp-leggi]') && opz.url) {
        esegui(function () { return scarica(opz.url, avanzamento); }, { linkPdf: opz.url, daPortale: true });
      } else if (e.target.closest('[data-lp-scegli]')) $f.click();
    });
    $f.addEventListener('change', function () { leggiFile($f.files && $f.files[0]); $f.value = ''; });
    el.addEventListener('dragover', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); el.classList.add('lp-sopra'); } });
    el.addEventListener('dragleave', function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove('lp-sopra'); });
    el.addEventListener('drop', function (e) {
      el.classList.remove('lp-sopra');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      leggiFile(f);
    });
  }

  root.LettorePerizia = { blocco: blocco, collega: collega, html: html, pdfjs: pdfjs, estrai: estrai };
})(typeof window !== 'undefined' ? window : globalThis);
