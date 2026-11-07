/** @jsxImportSource preact */
// Digital Showroom: filtri, vista lastre, zoom, preferiti, confronto (max 3) e raccolte personali.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CatalogueItem } from '~/lib/catalogue';
import {
  MAX_COMPARE,
  clearCompare,
  createCollection,
  deleteCollection,
  getCollections,
  getCompare,
  getSelection,
  onStoreChange,
  pullRemote,
  toggleCompare,
  toggleInCollection,
  toggleSelection,
  type Collection,
} from '~/scripts/store';

type Strings = Record<string, string>;
interface Props {
  lang: string;
  s: Strings;
  vocab: Record<string, Record<string, string>>;
  quoteHref: string;
}

type FilterKey = 'baseColor' | 'category' | 'finishes' | 'veinPattern';
const FILTERS: { key: FilterKey; label: string; vocab: string }[] = [
  { key: 'baseColor', label: 'filterColor', vocab: 'baseColor' },
  { key: 'category', label: 'filterType', vocab: 'category' },
  { key: 'finishes', label: 'filterFinish', vocab: 'finish' },
  { key: 'veinPattern', label: 'filterVein', vocab: 'veinPattern' },
];

const plural = (lang: string, n: number, one: string, other: string) =>
  (new Intl.PluralRules(lang).select(n) === 'one' ? one : other).replace('{count}', String(n));

function useStore() {
  const [tick, setTick] = useState(0);
  useEffect(() => onStoreChange(() => setTick((x) => x + 1)), []);
  return { selection: getSelection(), compare: getCompare(), collections: getCollections(), tick };
}

export default function Showroom({ lang, s, vocab, quoteHref }: Props) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>({ baseColor: [], category: [], finishes: [], veinPattern: [] });
  const [view, setView] = useState<'grid' | 'slab'>('grid');
  const [panel, setPanel] = useState<'compare' | 'collections' | null>(null);
  const [synced, setSynced] = useState(false);
  const store = useStore();

  useEffect(() => {
    fetch(`/${lang}/catalogue.json`)
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
    pullRemote().then(setSynced);
    if (location.hash === '#compare') setPanel('compare');
  }, [lang]);

  const options = useMemo(() => {
    const out = {} as Record<FilterKey, string[]>;
    for (const f of FILTERS) {
      const present = new Set(items.flatMap((it) => ([] as string[]).concat(it[f.key] as string | string[])));
      out[f.key] = Object.keys(vocab[f.vocab] ?? {}).filter((k) => present.has(k) || f.key === 'finishes');
    }
    return out;
  }, [items, vocab]);

  const visible = items.filter((it) =>
    FILTERS.every((f) => {
      const want = filters[f.key];
      if (!want.length) return true;
      const have = ([] as string[]).concat(it[f.key] as string | string[]);
      return want.some((w) => have.includes(w));
    }),
  );
  const toggleFilter = (key: FilterKey, value: string) =>
    setFilters((cur) => ({ ...cur, [key]: cur[key].includes(value) ? cur[key].filter((v) => v !== value) : [...cur[key], value] }));
  const anyFilter = Object.values(filters).some((v) => v.length);
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const compared = store.compare.map((c) => bySlug.get(c)).filter(Boolean) as CatalogueItem[];

  return (
    <div class="showroom">
      {/* Barra degli strumenti */}
      <div class="flex flex-col gap-6 border-b border-stone pb-6 lg:flex-row lg:items-end lg:justify-between">
        <fieldset class="grid gap-x-10 gap-y-5 md:grid-cols-2">
          <legend class="visually-hidden">{s.filters}</legend>
          {FILTERS.map((f) => (
            <div key={f.key}>
              <p class="field-label mb-2">{s[f.label]}</p>
              <div class="flex flex-wrap gap-2">
                {options[f.key].map((v) => {
                  const on = filters[f.key].includes(v);
                  return (
                    <button type="button" key={v} class={`chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggleFilter(f.key, v)}>
                      {vocab[f.vocab]?.[v] ?? v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
        <div class="flex flex-wrap items-center gap-3">
          {anyFilter && (
            <button type="button" class="btn btn-sm btn-outline" onClick={() => setFilters({ baseColor: [], category: [], finishes: [], veinPattern: [] })}>
              {s.reset}
            </button>
          )}
          <div class="inline-flex border border-stone" role="group" aria-label={s.view}>
            <button type="button" class={`seg ${view === 'grid' ? 'is-on' : ''}`} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              {s.viewGrid}
            </button>
            <button type="button" class={`seg ${view === 'slab' ? 'is-on' : ''}`} aria-pressed={view === 'slab'} onClick={() => setView('slab')}>
              {s.viewSlab}
            </button>
          </div>
          <button type="button" class="btn btn-sm btn-outline" aria-expanded={panel === 'collections'} onClick={() => setPanel(panel === 'collections' ? null : 'collections')}>
            {s.collections} ({store.collections.length})
          </button>
        </div>
      </div>
      {filters.finishes.length > 0 && <p class="mt-4 text-[0.85rem] text-ash">{s.finishNote}</p>}

      <p class="mt-6 text-[0.85rem] text-ash" role="status" aria-live="polite">
        {loading ? s.loading : plural(lang, visible.length, s.resultsOne, s.resultsOther)}
      </p>

      {panel === 'collections' && (
        <Collections s={s} collections={store.collections} items={bySlug} synced={synced} quoteHref={quoteHref} onClose={() => setPanel(null)} />
      )}

      {!loading && visible.length === 0 && <p class="mt-10 text-lg">{s.noResults}</p>}

      <ul class={view === 'grid' ? 'mt-8 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3' : 'mt-8 grid gap-14'}>
        {visible.map((it) => (
          <li key={it.slug}>
            <Card it={it} s={s} view={view} store={store} />
          </li>
        ))}
      </ul>

      {/* Barra del confronto */}
      {store.compare.length > 0 && (
        <div class="compare-bar on-dark" role="region" aria-label={s.compareTitle}>
          <div class="container-page flex flex-wrap items-center justify-between gap-4 py-4">
            <div class="flex items-center gap-3">
              {compared.map((c) => (
                <img key={c.slug} src={c.thumb} alt="" width={56} height={40} class="h-10 w-14 object-cover" />
              ))}
              <span class="text-[0.9rem]">{plural(lang, store.compare.length, s.compareBarOne, s.compareBarOther)}</span>
            </div>
            <div class="flex gap-3">
              <button type="button" class="btn btn-sm btn-outline" onClick={() => clearCompare()}>
                {s.compareClear}
              </button>
              <button type="button" class="btn btn-sm btn-light" onClick={() => setPanel('compare')} disabled={store.compare.length < 2} title={store.compare.length < 2 ? s.compareHint : undefined}>
                {s.compareNow}
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === 'compare' && compared.length > 0 && <Compare s={s} items={compared} onClose={() => setPanel(null)} />}
    </div>
  );
}

function Card({ it, s, view, store }: { it: CatalogueItem; s: Strings; view: 'grid' | 'slab'; store: ReturnType<typeof useStore> }) {
  const fav = store.selection.includes(it.slug);
  const cmp = store.compare.includes(it.slug);
  const [msg, setMsg] = useState('');
  const [menu, setMenu] = useState(false);
  return (
    <article class="group">
      <button type="button" class="relative block w-full cursor-zoom-in overflow-hidden bg-stone" data-zoom-src={it.zoom} data-zoom-alt={it.alt}>
        <img
          src={view === 'slab' ? it.slab : it.thumb}
          alt={it.alt}
          loading="lazy"
          decoding="async"
          class={`w-full object-cover transition-transform duration-[1.2s] group-hover:scale-[1.03] ${view === 'slab' ? 'aspect-[12/7]' : 'aspect-[4/3]'}`}
        />
        <span class="absolute bottom-3 end-3 bg-marble/95 px-2.5 py-1.5 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-graphite">{s.zoom}</span>
      </button>
      <div class="mt-5 flex items-start justify-between gap-4">
        <div>
          <p class="eyebrow !text-ash">{it.labels.baseColor.join(' · ')}</p>
          <h2 class="mt-2 font-display text-[1.7rem] leading-tight">
            <a href={it.url} class="text-graphite no-underline hover:text-brass-deep">
              {it.name}
            </a>
          </h2>
          <p class="mt-2 text-[0.92rem] text-ash">{it.tagline}</p>
          <p class="mt-2 text-[0.8rem] text-ash">{[...it.labels.veinPattern, ...it.labels.veinIntensity].join(' · ')}</p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" class="icon-btn" aria-pressed={fav} onClick={() => toggleSelection(it.slug)} title={s.favorite}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.3" aria-hidden="true">
            <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
          </svg>
          <span>{fav ? s.inSelection : s.addSelection}</span>
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-pressed={cmp}
          onClick={() => {
            const r = toggleCompare(it.slug);
            setMsg(r === 'full' ? s.compareMax : '');
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
            <rect x="3.5" y="4.5" width="7" height="15" />
            <rect x="13.5" y="4.5" width="7" height="15" />
          </svg>
          <span>{cmp ? s.inCompare : s.compare}</span>
        </button>
        <div class="relative">
          <button type="button" class="icon-btn" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <path d="M3.5 6.5h6l2 2h9v11h-17z" />
            </svg>
            <span>{s.addTo}</span>
          </button>
          {menu && <CollectionMenu s={s} slug={it.slug} collections={store.collections} onDone={() => setMenu(false)} />}
        </div>
      </div>
      {msg && (
        <p class="mt-2 text-[0.85rem] text-danger" role="status">
          {msg}
        </p>
      )}
    </article>
  );
}

function CollectionMenu({ s, slug, collections, onDone }: { s: Strings; slug: string; collections: Collection[]; onDone: () => void }) {
  const [name, setName] = useState('');
  return (
    <div class="absolute start-0 top-full z-20 mt-2 w-72 border border-stone bg-marble p-4 shadow-xl">
      {collections.length === 0 && <p class="text-[0.85rem] text-ash">{s.noCollections}</p>}
      <ul class="space-y-1">
        {collections.map((c) => (
          <li key={c.id}>
            <label class="flex items-center gap-3 py-1 text-[0.92rem]">
              <input type="checkbox" class="checkbox !mt-0" checked={c.items.includes(slug)} onChange={() => toggleInCollection(c.id, slug)} />
              {c.name}
            </label>
          </li>
        ))}
      </ul>
      <form
        class="mt-3 flex gap-2 border-t border-stone pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createCollection(name, [slug]);
          setName('');
          onDone();
        }}
      >
        <label class="visually-hidden" for={`col-${slug}`}>
          {s.collectionName}
        </label>
        <input id={`col-${slug}`} class="input !min-h-10 !py-2 text-[0.9rem]" placeholder={s.newCollection} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} maxLength={80} />
        <button type="submit" class="btn btn-sm btn-primary">
          {s.create}
        </button>
      </form>
    </div>
  );
}

function Collections({ s, collections, items, synced, quoteHref, onClose }: { s: Strings; collections: Collection[]; items: Map<string, CatalogueItem>; synced: boolean; quoteHref: string; onClose: () => void }) {
  const [name, setName] = useState('');
  return (
    <section class="mt-6 border border-stone bg-ivory p-6 lg:p-8" aria-label={s.collections}>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-display text-2xl">{s.collections}</h2>
          <p class="mt-1 text-[0.85rem] text-ash">{synced ? s.collectionsSynced : s.collectionsLocal}</p>
        </div>
        <button type="button" class="icon-btn" onClick={onClose}>
          {s.close}
        </button>
      </div>
      <form
        class="mt-6 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createCollection(name);
          setName('');
        }}
      >
        <label class="visually-hidden" for="new-collection">
          {s.collectionName}
        </label>
        <input id="new-collection" class="input" placeholder={s.newCollection} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} maxLength={80} />
        <button type="submit" class="btn btn-primary btn-sm">
          {s.create}
        </button>
      </form>
      {collections.length === 0 ? (
        <p class="mt-6 text-ash">{s.noCollections}</p>
      ) : (
        <ul class="mt-8 grid gap-6 md:grid-cols-2">
          {collections.map((c) => (
            <li key={c.id} class="border border-stone bg-marble p-5">
              <div class="flex items-center justify-between gap-3">
                <h3 class="font-display text-xl">{c.name}</h3>
                <button type="button" class="text-[0.8rem] text-ash underline" onClick={() => deleteCollection(c.id)}>
                  {s.deleteCollection}
                </button>
              </div>
              {c.items.length === 0 ? (
                <p class="mt-3 text-[0.85rem] text-ash">{s.emptyCollection}</p>
              ) : (
                <ul class="mt-4 flex flex-wrap gap-3">
                  {c.items.map((slug) => {
                    const it = items.get(slug);
                    return it ? (
                      <li key={slug}>
                        <a href={it.url} class="block w-24 text-[0.8rem] text-graphite no-underline">
                          <img src={it.thumb} alt="" class="aspect-square w-24 object-cover" loading="lazy" />
                          <span class="mt-1 block">{it.name}</span>
                        </a>
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
              {c.items.length > 0 && (
                <a href={`${quoteHref}?collection=${encodeURIComponent(c.items.join(','))}`} class="link-luxe mt-5 text-graphite">
                  {s.requestQuote}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Compare({ s, items, onClose }: { s: Strings; items: CatalogueItem[]; onClose: () => void }) {
  const rows: [string, (i: CatalogueItem) => string][] = [
    [s.baseColor, (i) => i.labels.baseColor.join(', ')],
    [s.veinColor, (i) => i.labels.veinColor.join(', ')],
    [s.veinIntensity, (i) => i.labels.veinIntensity.join(', ')],
    [s.veinPattern, (i) => i.labels.veinPattern.join(', ')],
    [s.finishes, (i) => i.labels.finishes.join(', ') || s.toVerify],
    [s.thicknesses, (i) => i.thicknesses.join(', ') || s.toVerify],
    [s.applications, (i) => i.labels.applications.join(', ') || s.toVerify],
  ];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="compare-overlay" role="dialog" aria-modal="true" aria-labelledby="compare-title">
      <div class="container-page py-10">
        <div class="flex items-center justify-between gap-4">
          <h2 id="compare-title" class="display-md">
            {s.compareTitle}
          </h2>
          <button type="button" class="btn btn-sm btn-outline" onClick={onClose} autoFocus>
            {s.close}
          </button>
        </div>
        <div class="mt-8 overflow-x-auto">
          <table class="w-full min-w-[640px] border-collapse text-start text-[0.92rem]">
            <thead>
              <tr>
                <th class="w-44" />
                {items.map((i) => (
                  <th key={i.slug} class="px-3 pb-6 text-start align-top font-normal">
                    <button type="button" class="block w-full cursor-zoom-in" data-zoom-src={i.zoom} data-zoom-alt={i.alt}>
                      <img src={i.thumb} alt={i.alt} class="aspect-[4/3] w-full object-cover" />
                    </button>
                    <a href={i.url} class="mt-3 block font-display text-2xl text-graphite no-underline">
                      {i.name}
                    </a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, fn]) => (
                <tr key={label} class="border-t border-stone">
                  <th scope="row" class="py-3 pe-4 text-start font-normal text-ash">
                    {label}
                  </th>
                  {items.map((i) => (
                    <td key={i.slug} class="px-3 py-3 align-top">
                      {fn(i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="mt-6 text-[0.85rem] text-ash">{s.disclaimer}</p>
      </div>
    </div>
  );
}
