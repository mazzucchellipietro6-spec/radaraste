// Selezione, confronto e raccolte del visitatore.
// Restano nel browser; se il visitatore ha effettuato l'accesso vengono sincronizzate con il suo account.
export type Collection = { id: string; name: string; items: string[]; updatedAt: string };

const KEYS = { selection: 'wc-selection', compare: 'wc-compare', collections: 'wc-collections' } as const;
const EVENT = 'wc:store';
export const MAX_COMPARE = 3;

function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* archivio non disponibile (navigazione privata) */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } }));
}

export const getSelection = () => read<string[]>(KEYS.selection, []).filter((s) => typeof s === 'string');
export const getCompare = () => read<string[]>(KEYS.compare, []).slice(0, MAX_COMPARE);
export const getCollections = () => read<Collection[]>(KEYS.collections, []);

export function toggleSelection(slug: string) {
  const sel = getSelection();
  const next = sel.includes(slug) ? sel.filter((s) => s !== slug) : [...sel, slug];
  write(KEYS.selection, next);
  pushRemote('favorites', next);
  return next.includes(slug);
}
export function setSelection(list: string[], remote = true) {
  write(KEYS.selection, Array.from(new Set(list)));
  if (remote) pushRemote('favorites', list);
}
export function toggleCompare(slug: string): 'added' | 'removed' | 'full' {
  const cmp = getCompare();
  if (cmp.includes(slug)) {
    write(KEYS.compare, cmp.filter((s) => s !== slug));
    return 'removed';
  }
  if (cmp.length >= MAX_COMPARE) return 'full';
  write(KEYS.compare, [...cmp, slug]);
  return 'added';
}
export const clearCompare = () => write(KEYS.compare, []);

export function saveCollections(list: Collection[], remote = true) {
  write(KEYS.collections, list);
  if (remote) pushRemote('collections', list);
}
export function createCollection(name: string, items: string[] = []) {
  const c: Collection = { id: crypto.randomUUID(), name: name.trim().slice(0, 80), items, updatedAt: new Date().toISOString() };
  saveCollections([...getCollections(), c]);
  return c;
}
export function toggleInCollection(id: string, slug: string) {
  saveCollections(
    getCollections().map((c) =>
      c.id === id
        ? { ...c, items: c.items.includes(slug) ? c.items.filter((s) => s !== slug) : [...c.items, slug], updatedAt: new Date().toISOString() }
        : c,
    ),
  );
}
export const deleteCollection = (id: string) => saveCollections(getCollections().filter((c) => c.id !== id));

export function onStoreChange(cb: () => void) {
  const h = () => cb();
  window.addEventListener(EVENT, h);
  window.addEventListener('storage', h);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener('storage', h);
  };
}

// ---- sincronizzazione con l'account (solo se il visitatore ha effettuato l'accesso) ----
let signedIn: boolean | null = null;
async function isSignedIn() {
  if (signedIn === null) signedIn = document.cookie.includes('wc_auth=1');
  return signedIn;
}
async function pushRemote(kind: 'favorites' | 'collections', data: unknown) {
  if (!(await isSignedIn())) return;
  fetch(`/api/me/${kind}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }).catch(() => {});
}
/** All'apertura della pagina: unisce i dati salvati nell'account con quelli del browser. */
export async function pullRemote() {
  if (!(await isSignedIn())) return false;
  try {
    const res = await fetch('/api/me/favorites');
    if (res.ok) {
      const remote: string[] = (await res.json()).items ?? [];
      const merged = Array.from(new Set([...remote, ...getSelection()]));
      setSelection(merged, merged.length !== remote.length);
    }
    const rc = await fetch('/api/me/collections');
    if (rc.ok) {
      const remote: Collection[] = (await rc.json()).items ?? [];
      const local = getCollections();
      const byId = new Map(remote.map((c) => [c.id, c]));
      for (const c of local) if (!byId.has(c.id)) byId.set(c.id, c);
      const merged = Array.from(byId.values());
      saveCollections(merged, merged.length !== remote.length);
    }
    return true;
  } catch {
    return false;
  }
}
