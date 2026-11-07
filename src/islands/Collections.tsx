/** @jsxImportSource preact */
// Raccolte personali (area clienti): crea, elimina, apri; sincronizzate con l'account.
import { useEffect, useState } from 'preact/hooks';
import type { CatalogueItem } from '~/lib/catalogue';
import { createCollection, deleteCollection, getCollections, onStoreChange, pullRemote, toggleInCollection, type Collection } from '~/scripts/store';

export default function Collections({ lang, s, quoteHref }: { lang: string; s: Record<string, string>; quoteHref: string }) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [list, setList] = useState<Collection[]>([]);
  const [name, setName] = useState('');
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    setList(getCollections());
    fetch(`/${lang}/catalogue.json`).then((r) => r.json()).then((d) => setItems(d.items));
    pullRemote().then(setSynced);
    return onStoreChange(() => setList(getCollections()));
  }, [lang]);
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  return (
    <div>
      <h2 class="display-md">{s.collections}</h2>
      <p class="mt-2 text-[0.85rem] text-ash">{synced ? s.collectionsSynced : s.collectionsLocal}</p>
      <form
        class="mt-6 flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createCollection(name);
          setName('');
        }}
      >
        <label class="visually-hidden" for="acc-new-collection">
          {s.collectionName}
        </label>
        <input id="acc-new-collection" class="input" placeholder={s.newCollection} value={name} maxLength={80} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button class="btn btn-primary btn-sm" type="submit">
          {s.create}
        </button>
      </form>
      {list.length === 0 ? (
        <p class="mt-6 text-ash">{s.noCollections}</p>
      ) : (
        <ul class="mt-8 grid gap-6 md:grid-cols-2">
          {list.map((c) => (
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
                    const it = bySlug.get(slug);
                    return it ? (
                      <li key={slug} class="w-24 text-[0.8rem]">
                        <a href={it.url} class="block text-graphite no-underline">
                          <img src={it.thumb} alt="" class="aspect-square w-24 object-cover" loading="lazy" />
                          <span class="mt-1 block">{it.name}</span>
                        </a>
                        <button type="button" class="text-[0.75rem] text-ash underline" onClick={() => toggleInCollection(c.id, slug)}>
                          ×
                        </button>
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
    </div>
  );
}
