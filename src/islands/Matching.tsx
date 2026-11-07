/** @jsxImportSource preact */
// Marble Matching: la foto viene analizzata nel browser (colori e venature) e, se attiva, dall'AI.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CatalogueItem } from '~/lib/catalogue';
import { compare, extractFeatures, loadImageData, toJpegDataUrl, type Comparison, type Features } from '~/scripts/marble-features';
import { getCompare, getSelection, onStoreChange, toggleCompare, toggleSelection } from '~/scripts/store';

type S = Record<string, string>;
interface Props {
  lang: string;
  s: S;
  quoteHref: string;
  turnstileKey?: string;
}
interface Match {
  item: CatalogueItem;
  level: 'high' | 'medium' | 'low';
  text?: string;
  local?: Comparison;
}
interface AiResult {
  isStone: boolean;
  analysis: { background: string; veins: string; pattern: string; notes: string };
  matches: { slug: string; similarity: 'high' | 'medium' | 'low'; reasons: string }[];
  caveat: string;
}

const MAX = 15 * 1024 * 1024;
const featureCache = new Map<string, Features>();

async function catalogueFeatures(items: CatalogueItem[]) {
  return Promise.all(
    items.map(async (it) => {
      if (!featureCache.has(it.slug)) featureCache.set(it.slug, extractFeatures(await loadImageData(it.thumb)));
      return { it, f: featureCache.get(it.slug)! };
    }),
  );
}

export default function Matching({ lang, s, quoteHref, turnstileKey }: Props) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [engine, setEngine] = useState<'ai' | 'local'>('local');
  const [drag, setDrag] = useState(false);
  const [, setTick] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const tsBox = useRef<HTMLDivElement>(null);
  const tsToken = useRef('');

  useEffect(() => {
    fetch(`/${lang}/catalogue.json`).then((r) => r.json()).then((d) => setItems(d.items));
    return onStoreChange(() => setTick((x) => x + 1));
  }, [lang]);

  useEffect(() => {
    if (!turnstileKey || !tsBox.current) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => {
      const w = window as unknown as { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => void } };
      w.turnstile?.render(tsBox.current!, { sitekey: turnstileKey, language: lang, appearance: 'interaction-only', callback: (t: string) => (tsToken.current = t) });
    };
    document.head.appendChild(s);
  }, [turnstileKey]);

  const pick = (f: File | undefined | null) => {
    setError('');
    setMatches(null);
    setAi(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError(s.invalidType);
    if (f.size > MAX) return setError(s.tooBig);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const analyze = async () => {
    if (!file || !items.length) return;
    setBusy(true);
    setError('');
    try {
      // 1. analisi locale (sempre disponibile)
      const photo = extractFeatures(await loadImageData(file));
      const ranked = (await catalogueFeatures(items))
        .map(({ it, f }) => ({ it, cmp: compare(photo, f) }))
        .sort((a, b) => a.cmp.distance - b.cmp.distance)
        .slice(0, 3)
        .map(({ it, cmp }) => ({ item: it, level: cmp.level, local: cmp }));
      let final: Match[] = ranked;
      let usedAi = false;
      let aiRes: AiResult | null = null;
      // 2. analisi AI, se configurata sul server
      try {
        const res = await fetch('/api/ai/match', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: await toJpegDataUrl(file), lang, 'cf-turnstile-response': tsToken.current }),
        });
        if (res.ok) {
          const data = await res.json();
          aiRes = data.result as AiResult;
          if (aiRes.isStone && aiRes.matches.length) {
            final = aiRes.matches
              .map((m) => ({ item: items.find((i) => i.slug === m.slug)!, level: m.similarity, text: m.reasons }))
              .filter((m) => m.item);
          }
          usedAi = true;
        }
      } catch {
        /* AI non raggiungibile: resta l'analisi locale */
      }
      setEngine(usedAi ? 'ai' : 'local');
      setAi(aiRes);
      setMatches(aiRes && !aiRes.isStone ? [] : final);
      requestAnimationFrame(() => results.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    } catch {
      setError(s.error);
    } finally {
      setBusy(false);
    }
  };

  const reasonsText = (m: Match) => {
    if (m.text) return <p class="mt-3 text-[0.95rem] leading-relaxed">{m.text}</p>;
    const c = m.local!;
    return (
      <div class="mt-3 space-y-2 text-[0.92rem]">
        <p>
          <strong class="font-medium">{s.common}: </strong>
          {c.reasons.length ? c.reasons.map((r) => s[`reason.${r}`]).join(', ') : s.noReasons}
        </p>
        {c.differences.length > 0 && (
          <p class="text-ash">
            <strong class="font-medium text-graphite">{s.differences}: </strong>
            {c.differences.map((d) => s[`difference.${d}`]).join(', ')}
          </p>
        )}
      </div>
    );
  };

  const sel = getSelection();
  const cmp = getCompare();

  return (
    <div class="grid gap-12 lg:grid-cols-12">
      <div class="lg:col-span-5">
        <div
          class={`dropzone ${drag ? 'is-drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer?.files?.[0]);
          }}
        >
          {preview ? (
            <img src={preview} alt={s.yourPhoto} class="aspect-[4/3] w-full object-cover" />
          ) : (
            <div class="flex aspect-[4/3] flex-col items-center justify-center gap-4 p-8 text-center">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.1" class="text-brass" aria-hidden="true">
                <path d="M12 16V4M7 9l5-5 5 5M4 15v4.5h16V15" />
              </svg>
              <p class="font-display text-2xl">{s.upload}</p>
              <p class="text-[0.92rem] text-ash">
                {s.dropHere}{' '}
                <button type="button" class="text-brass-deep underline" onClick={() => input.current?.click()}>
                  {s.choose}
                </button>
              </p>
            </div>
          )}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden" id="matching-file" onChange={(e) => pick((e.target as HTMLInputElement).files?.[0])} />
        </div>
        <p class="mt-3 text-[0.85rem] text-ash">{s.uploadHint}</p>
        <div ref={tsBox} class="mt-4" />
        <div class="mt-6 flex flex-wrap gap-3">
          <button type="button" class="btn btn-primary" disabled={!file || busy || !items.length} onClick={analyze} aria-busy={busy}>
            {busy ? s.analyzing : s.analyze}
          </button>
          {preview && (
            <label for="matching-file" class="btn btn-outline cursor-pointer">
              {s.another}
            </label>
          )}
        </div>
        {error && (
          <p class="mt-4 text-danger" role="alert">
            {error}
          </p>
        )}
        <p class="mt-6 flex gap-3 text-[0.85rem] text-ash">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" class="mt-0.5 shrink-0 text-brass-deep" aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="10" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
          {s.privacy}
        </p>
      </div>

      <div class="lg:col-span-6 lg:col-start-7" ref={results} aria-live="polite">
        {!matches && (
          <div class="border border-stone bg-ivory p-8">
            <h2 class="font-display text-2xl">{s.tipsTitle}</h2>
            <ol class="mt-6 space-y-4">
              {['tip1', 'tip2', 'tip3'].map((k, i) => (
                <li key={k} class="flex gap-4">
                  <span class="font-display text-xl text-brass-deep">0{i + 1}</span>
                  <span>{s[k]}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {matches && (
          <div>
            <p class="eyebrow">{engine === 'ai' ? s.engineAi : s.engineLocal}</p>
            {engine === 'local' && <p class="mt-2 text-[0.85rem] text-ash">{s.engineLocalNote}</p>}
            {ai?.isStone && (
              <div class="mt-6 border border-stone bg-ivory p-6">
                <h2 class="font-display text-xl">{s.analysisTitle}</h2>
                <dl class="mt-4 grid gap-2 text-[0.92rem]">
                  {(['background', 'veins', 'pattern', 'notes'] as const).map((k) =>
                    ai.analysis[k] ? (
                      <div key={k} class="grid grid-cols-[7rem_1fr] gap-3">
                        <dt class="text-ash">{s[k]}</dt>
                        <dd>{ai.analysis[k]}</dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </div>
            )}
            {matches.length === 0 ? (
              <p class="mt-8 text-lg">{s.notStone}</p>
            ) : (
              <>
                <h2 class="display-md mt-8">{s.resultsTitle}</h2>
                <ol class="mt-6 space-y-8">
                  {matches.map((m, i) => (
                    <li key={m.item.slug} class="grid gap-5 border-t border-stone pt-6 sm:grid-cols-[10rem_1fr]">
                      <button type="button" class="block self-start cursor-zoom-in overflow-hidden bg-stone" data-zoom-src={m.item.zoom} data-zoom-alt={m.item.alt}>
                        <img src={m.item.thumb} alt={m.item.alt} class="aspect-square w-full object-cover" loading="lazy" />
                      </button>
                      <div>
                        <p class="eyebrow !text-ash">
                          0{i + 1} · {s[`similarity.${m.level}`]}
                        </p>
                        <h3 class="mt-2 font-display text-2xl">
                          <a href={m.item.url} class="text-graphite no-underline hover:text-brass-deep">
                            {m.item.name}
                          </a>
                        </h3>
                        {reasonsText(m)}
                        <div class="mt-4 flex flex-wrap gap-2">
                          <button type="button" class="icon-btn" aria-pressed={sel.includes(m.item.slug)} onClick={() => toggleSelection(m.item.slug)}>
                            {sel.includes(m.item.slug) ? s.inSelection : s.addSelection}
                          </button>
                          <button type="button" class="icon-btn" aria-pressed={cmp.includes(m.item.slug)} onClick={() => toggleCompare(m.item.slug)}>
                            {cmp.includes(m.item.slug) ? s.inCompare : s.compare}
                          </button>
                          <a href={m.item.url} class="icon-btn no-underline">
                            {s.open}
                          </a>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <a href={`${quoteHref}?selection=${encodeURIComponent(matches.map((m) => m.item.slug).join(','))}&source=matching`} class="btn btn-primary mt-10">
                  {s.requestQuote}
                </a>
              </>
            )}
            <p class="mt-8 flex gap-3 text-[0.85rem] text-ash">{ai?.caveat || s.caveat}</p>
          </div>
        )}
      </div>
    </div>
  );
}
