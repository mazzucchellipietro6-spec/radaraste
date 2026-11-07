// Prezzi riservati ai professionisti B2B approvati: arrivano dal server solo dopo il controllo dell'account.
type Price = { finish: string | null; thickness: string | null; price: number; unit: string; currency: string; validUntil: string | null; note: string | null };

export async function loadB2bPrices() {
  const box = document.querySelector<HTMLElement>('[data-b2b-prices]');
  if (!box || !document.cookie.includes('wc_auth=1')) return;
  try {
    const res = await fetch(`/api/b2b/prices?marble=${encodeURIComponent(box.dataset.b2bPrices!)}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return;
    const data: { approved: boolean; prices: Price[]; labels: Record<string, string> } = await res.json();
    if (!data.approved) return;
    box.querySelector<HTMLElement>('[data-b2b-cta]')!.hidden = true;
    box.querySelector<HTMLElement>('[data-b2b-text]')!.hidden = true;
    if (!data.prices.length) {
      box.querySelector<HTMLElement>('[data-b2b-none]')!.hidden = false;
      return;
    }
    const lang = document.documentElement.lang;
    const list = box.querySelector<HTMLElement>('[data-b2b-list]')!;
    const ul = document.createElement('ul');
    ul.className = 'mt-6 divide-y divide-stone border-y border-stone';
    for (const p of data.prices) {
      const li = document.createElement('li');
      li.className = 'flex items-baseline justify-between gap-4 py-3 text-[0.95rem]';
      const label = document.createElement('span');
      label.textContent = [p.finish, p.thickness, p.note].filter(Boolean).join(' · ') || '—';
      const val = document.createElement('strong');
      val.className = 'font-medium';
      val.textContent = `${new Intl.NumberFormat(lang, { style: 'currency', currency: p.currency || 'EUR' }).format(p.price)} / ${p.unit}`;
      li.append(label, val);
      ul.append(li);
    }
    list.append(ul);
    list.hidden = false;
    box.querySelector<HTMLElement>('[data-b2b-note]')!.hidden = false;
  } catch {
    /* prezzi non disponibili */
  }
}
