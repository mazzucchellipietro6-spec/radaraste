// Elimina i doppioni tra fonti: la stessa vendita giudiziaria è pubblicata sul PVP e,
// spesso, anche sui siti dei gestori (Astalegale, Fallco…). Si tiene la prima fonte in
// ordine di priorità e alle altre si lascia solo il link ("altriLink").
//
// Due aste sono la stessa vendita se coincidono tribunale, numero di procedura e data,
// e (quando entrambe lo indicano) il prezzo base differisce al massimo dell'1%.

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^tribunale\s+(ordinario\s+)?d[ie]\s+/, '').replace(/[^a-z]/g, '');

export function numeroProcedura(rge) {
  const m = String(rge || '').match(/(\d+)/);
  return m ? String(parseInt(m[1], 10)) : '';
}

export function chiave(a) {
  const t = norm(a.tribunale), n = numeroProcedura(a.rge);
  return t && n && a.dataAsta ? `${t}|${n}|${a.dataAsta}` : null;
}

function stessoPrezzo(a, b) {
  if (!(a.prezzoBase > 0) || !(b.prezzoBase > 0)) return true;
  return Math.abs(a.prezzoBase - b.prezzoBase) <= Math.max(1, 0.01 * Math.max(a.prezzoBase, b.prezzoBase));
}

// elenchi: array di array di aste, già in ordine di priorità (prima il PVP).
export function unisci(elenchi) {
  const tenute = [], indice = new Map();
  let doppioni = 0;
  for (const lista of elenchi) {
    for (const a of lista) {
      const k = chiave(a);
      const gemella = k && (indice.get(k) || []).find((x) => x.fonte !== a.fonte && stessoPrezzo(x, a));
      if (gemella) {
        gemella.altriLink = gemella.altriLink || [];
        if (!gemella.altriLink.some((l) => l[1] === a.linkAvviso)) gemella.altriLink.push([a.fonte, a.linkAvviso]);
        doppioni++;
        continue;
      }
      tenute.push(a);
      if (k) { if (!indice.has(k)) indice.set(k, []); indice.get(k).push(a); }
    }
  }
  return { aste: tenute, doppioni };
}
