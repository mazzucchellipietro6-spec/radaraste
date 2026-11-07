/** @jsxImportSource preact */
// "La mia selezione": i marmi salvati dal visitatore, con richiesta di preventivo.
import { useEffect, useState } from 'preact/hooks';
import type { CatalogueItem } from '~/lib/catalogue';
import { getSelection, onStoreChange, pullRemote, setSelection, toggleSelection } from '~/scripts/store';

interface Props {
  lang: string;
  s: Record<string, string>;
  quoteHref: string;
  browseHref: string;
}

export default function Selection({ lang, s, quoteHref, browseHref }: Props) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    setSel(getSelection());
    fetch(`/${lang}/catalogue.json`).then((r) => r.json()).then((d) => setItems(d.items));
    pullRemote().then(setSynced);
    return onStoreChange(() => setSel(getSelection()));
  }, [lang]);
  const list = sel.map((slug) => items.find((i) => i.slug === slug)).filter(Boolean) as CatalogueItem[];
  if (!sel.length)
    return (
      <div class="py-10">
        <p class="text-lg">{s.empty}</p>
        <a href={browseHref} class="btn btn-primary mt-8">
          {s.browse}
        </a>
      </div>
    );
  return (
    <div>
      {synced && <p class="text-[0.85rem] text-ash">{s.saved}</p>}
      <ul class="mt-6 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((it) => (
          <li key={it.slug}>
            <a href={it.url} class="card-hover block overflow-hidden bg-stone">
              <img src={it.thumb} alt={it.alt} class="aspect-[4/3] w-full object-cover" loading="lazy" />
            </a>
            <div class="mt-4 flex items-start justify-between gap-4">
              <div>
                <h2 class="font-display text-2xl">
                  <a href={it.url} class="text-graphite no-underline">
                    {it.name}
                  </a>
                </h2>
                <p class="mt-1 text-[0.9rem] text-ash">{it.tagline}</p>
              </div>
              <button type="button" class="icon-btn shrink-0" onClick={() => toggleSelection(it.slug)}>
                {s.remove}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div class="mt-14 flex flex-wrap gap-4">
        <a href={`${quoteHref}?selection=${encodeURIComponent(sel.join(','))}`} class="btn btn-primary">
          {s.request}
        </a>
        <button type="button" class="btn btn-outline" onClick={() => setSelection([])}>
          {s.clear}
        </button>
      </div>
    </div>
  );
}
