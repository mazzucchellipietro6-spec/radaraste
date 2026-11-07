/** @jsxImportSource preact */
// Marble Concierge: domande guidate -> proposte dal catalogo -> richiesta commerciale.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CatalogueItem } from '~/lib/catalogue';

type S = Record<string, string>;
type Vocab = Record<string, Record<string, string>>;
interface Props {
  lang: string;
  s: S;
  vocab: Vocab;
  privacyHref: string;
  turnstileKey?: string;
}
interface Brief {
  project: string;
  use: string[];
  color: string[];
  intensity: string;
  pattern: string;
  material: string[];
  quantity: string;
  unit: string;
  finish: string[];
  country: string;
  city: string;
  budget: string;
}
const EMPTY: Brief = { project: '', use: [], color: [], intensity: '', pattern: '', material: [], quantity: '', unit: 'm2', finish: [], country: '', city: '', budget: '' };
const STEPS = ['project', 'use', 'color', 'veins', 'material', 'quantity', 'finish', 'destination', 'budget', 'proposals', 'contact'] as const;

function score(it: CatalogueItem, b: Brief) {
  let pts = 0;
  const why: string[] = [];
  if (b.color.length && b.color.some((c) => it.baseColor.includes(c))) (pts += 3), why.push('color');
  if (b.intensity && it.veinIntensity === b.intensity) (pts += 2), why.push('intensity');
  if (b.pattern && it.veinPattern === b.pattern) (pts += 2), why.push('pattern');
  if (b.material.includes(it.slug)) (pts += 4), why.push('material');
  if (b.finish.length && b.finish.some((f) => it.finishes.includes(f))) (pts += 1), why.push('finish');
  if (b.use.length && b.use.some((u) => it.applications.includes(u))) (pts += 1), why.push('use');
  return { pts, why: why.length ? why : ['general'] };
}

export default function Concierge({ lang, s, vocab, privacyHref, turnstileKey }: Props) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [i, setI] = useState(0);
  const [b, setB] = useState<Brief>(EMPTY);
  const [ai, setAi] = useState<{ intro: string; picks: { slug: string; why: string }[] } | null>(null);
  const [contact, setContact] = useState({ name: '', email: '', phone: '', company: '', message: '', privacy: false });
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [started] = useState(Date.now());

  useEffect(() => {
    fetch(`/${lang}/catalogue.json`).then((r) => r.json()).then((d) => setItems(d.items));
  }, [lang]);

  const ranked = useMemo(
    () =>
      items
        .map((it) => ({ it, ...score(it, b) }))
        .sort((x, y) => y.pts - x.pts)
        .filter((x, idx) => x.pts > 0 || idx < 3)
        .slice(0, 3),
    [items, b],
  );

  useEffect(() => {
    if (STEPS[i] !== 'proposals' || !ranked.length) return;
    setAi(null);
    fetch('/api/ai/concierge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang, brief: b, candidates: ranked.map((r) => r.it.slug) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.result && setAi(d.result))
      .catch(() => {});
  }, [i]);

  const step = STEPS[i];
  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setB((cur) => ({ ...cur, [k]: v }));
  const toggle = (k: 'use' | 'color' | 'material' | 'finish', v: string) =>
    setB((cur) => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter((x) => x !== v) : [...cur[k], v] }));

  const chips = (group: string, k: 'use' | 'color' | 'finish', none = true) => (
    <div class="flex flex-wrap gap-2">
      {Object.entries(vocab[group]).map(([v, label]) => (
        <button type="button" key={v} class={`chip ${b[k].includes(v) ? 'is-on' : ''}`} aria-pressed={b[k].includes(v)} onClick={() => toggle(k, v)}>
          {label}
        </button>
      ))}
      {none && (
        <button type="button" class={`chip ${b[k].length === 0 ? 'is-on' : ''}`} aria-pressed={b[k].length === 0} onClick={() => set(k, [])}>
          {s.noPreference}
        </button>
      )}
    </div>
  );
  const radio = (group: string, k: 'project' | 'intensity' | 'pattern') => (
    <div class="flex flex-wrap gap-2">
      {Object.entries(vocab[group]).map(([v, label]) => (
        <button type="button" key={v} class={`chip ${b[k] === v ? 'is-on' : ''}`} aria-pressed={b[k] === v} onClick={() => set(k, b[k] === v ? '' : v)}>
          {label}
        </button>
      ))}
      {k !== 'project' && (
        <button type="button" class={`chip ${b[k] === '' ? 'is-on' : ''}`} aria-pressed={b[k] === ''} onClick={() => set(k, '')}>
          {s.noPreference}
        </button>
      )}
    </div>
  );

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!contact.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) return setStatus({ kind: 'err', text: s.errorRequired });
    if (!contact.privacy) return setStatus({ kind: 'err', text: s.errorPrivacy });
    setBusy(true);
    setStatus(null);
    try {
      const token = (document.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value ?? '';
      const res = await fetch('/api/forms/concierge', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ ...contact, privacy: contact.privacy ? 'yes' : '', lang, brief: b, proposals: ranked.map((r) => r.it.slug), _ts: started, 'cf-turnstile-response': token }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) setStatus({ kind: 'ok', text: data.message ?? s.success.replace('{ref}', data.reference ?? '') });
      else setStatus({ kind: 'err', text: (data.code && s[`err_${data.code}`]) || s.errorGeneric });
    } catch {
      setStatus({ kind: 'err', text: s.errorGeneric });
    } finally {
      setBusy(false);
    }
  };

  const title: Record<string, string> = {
    project: s['q.project'], use: s['q.use'], color: s['q.color'], veins: s['q.veins'], material: s['q.material'], quantity: s['q.quantity'],
    finish: s['q.finish'], destination: s['q.destination'], budget: s['q.budget'], proposals: s.proposalsTitle, contact: s['q.contact'],
  };
  const hint: Record<string, string | undefined> = { use: s['hint.use'], quantity: s['hint.quantity'], budget: s['hint.budget'], destination: s['hint.destination'], proposals: s.proposalsLead };

  return (
    <div class="concierge mx-auto max-w-3xl">
      <div class="flex items-center justify-between gap-4">
        <p class="eyebrow !text-ash">{s.step.replace('{n}', String(i + 1)).replace('{total}', String(STEPS.length))}</p>
        {i > 0 && status?.kind !== 'ok' && (
          <button type="button" class="text-[0.85rem] text-ash underline" onClick={() => (setB(EMPTY), setI(0), setStatus(null))}>
            {s.restart}
          </button>
        )}
      </div>
      <div class="mt-3 h-px w-full bg-stone">
        <div class="h-px bg-brass transition-all duration-500" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
      </div>

      <fieldset class="mt-10" key={step}>
        <legend class="display-md">{title[step]}</legend>
        {hint[step] && <p class="mt-3 text-ash">{hint[step]}</p>}
        <div class="mt-8">
          {step === 'project' && radio('projectType', 'project')}
          {step === 'use' && chips('application', 'use', false)}
          {step === 'color' && chips('baseColor', 'color')}
          {step === 'veins' && (
            <div class="space-y-6">
              <div>
                <p class="field-label mb-3">{s['q.intensity']}</p>
                {radio('veinIntensity', 'intensity')}
              </div>
              <div>
                <p class="field-label mb-3">{s['q.pattern']}</p>
                {radio('veinPattern', 'pattern')}
              </div>
            </div>
          )}
          {step === 'material' && (
            <div class="flex flex-wrap gap-2">
              {items.map((it) => (
                <button type="button" key={it.slug} class={`chip ${b.material.includes(it.slug) ? 'is-on' : ''}`} aria-pressed={b.material.includes(it.slug)} onClick={() => toggle('material', it.slug)}>
                  {it.name}
                </button>
              ))}
              <button type="button" class={`chip ${b.material.length === 0 ? 'is-on' : ''}`} aria-pressed={b.material.length === 0} onClick={() => set('material', [])}>
                {s.dontKnow}
              </button>
            </div>
          )}
          {step === 'quantity' && (
            <div class="grid max-w-md grid-cols-[1fr_auto] gap-4">
              <label class="field">
                <span class="field-label">{s.quantityValue}</span>
                <input class="input" inputMode="decimal" value={b.quantity} onInput={(e) => set('quantity', (e.target as HTMLInputElement).value.slice(0, 30))} placeholder={s.dontKnow} />
              </label>
              <label class="field">
                <span class="field-label">{s.unit}</span>
                <select class="input" value={b.unit} onChange={(e) => set('unit', (e.target as HTMLSelectElement).value)}>
                  {['m2', 'slabs', 'pieces', 'blocks'].map((u) => (
                    <option key={u} value={u}>
                      {s[`units.${u}`]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {step === 'finish' && chips('finish', 'finish')}
          {step === 'destination' && (
            <div class="grid max-w-xl gap-4 sm:grid-cols-2">
              <label class="field">
                <span class="field-label">{s.country}</span>
                <input class="input" autoComplete="country-name" value={b.country} onInput={(e) => set('country', (e.target as HTMLInputElement).value.slice(0, 80))} />
              </label>
              <label class="field">
                <span class="field-label">{s.city}</span>
                <input class="input" autoComplete="address-level2" value={b.city} onInput={(e) => set('city', (e.target as HTMLInputElement).value.slice(0, 80))} />
              </label>
            </div>
          )}
          {step === 'budget' && (
            <label class="field max-w-md">
              <span class="field-label">{s['q.budget']}</span>
              <input class="input" value={b.budget} placeholder={s.budgetPlaceholder} onInput={(e) => set('budget', (e.target as HTMLInputElement).value.slice(0, 60))} />
            </label>
          )}
          {step === 'proposals' && (
            <div>
              {ranked.every((r) => r.pts === 0) && <p class="mb-6 text-ash">{s.noMatch}</p>}
              {ai?.intro && (
                <div class="mb-8 border-s-2 border-brass ps-5">
                  <p class="eyebrow">{s.aiNote}</p>
                  <p class="mt-2">{ai.intro}</p>
                </div>
              )}
              <ol class="space-y-6">
                {ranked.map(({ it, why }, n) => (
                  <li key={it.slug} class="grid gap-5 border-t border-stone pt-6 sm:grid-cols-[9rem_1fr]">
                    <img src={it.thumb} alt={it.alt} class="aspect-square w-full self-start object-cover" loading="lazy" />
                    <div>
                      <p class="eyebrow !text-ash">0{n + 1}</p>
                      <h3 class="mt-1 font-display text-2xl">
                        <a href={it.url} class="text-graphite no-underline" target="_blank" rel="noopener">
                          {it.name}
                        </a>
                      </h3>
                      <p class="mt-2 text-[0.95rem]">{ai?.picks.find((p) => p.slug === it.slug)?.why ?? why.map((w) => s[`why.${w}`]).join('; ')}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p class="mt-8 text-[0.85rem] text-ash">{s.proposalsNote}</p>
            </div>
          )}
          {step === 'contact' &&
            (status?.kind === 'ok' ? (
              <div class="form-ok border border-success bg-white p-6 text-success" role="status">
                {status.text}
              </div>
            ) : (
              <form class="space-y-5" onSubmit={submit} noValidate>
                <div class="grid gap-5 sm:grid-cols-2">
                  <label class="field">
                    <span class="field-label">{s.name}</span>
                    <input class="input" required autoComplete="name" value={contact.name} onInput={(e) => setContact({ ...contact, name: (e.target as HTMLInputElement).value })} />
                  </label>
                  <label class="field">
                    <span class="field-label">{s.email}</span>
                    <input class="input" type="email" dir="ltr" required autoComplete="email" value={contact.email} onInput={(e) => setContact({ ...contact, email: (e.target as HTMLInputElement).value })} />
                  </label>
                  <label class="field">
                    <span class="field-label">
                      {s.phone} <span class="normal-case tracking-normal">({s.optional})</span>
                    </span>
                    <input class="input" type="tel" dir="ltr" autoComplete="tel" value={contact.phone} onInput={(e) => setContact({ ...contact, phone: (e.target as HTMLInputElement).value })} />
                  </label>
                  <label class="field">
                    <span class="field-label">
                      {s.company} <span class="normal-case tracking-normal">({s.optional})</span>
                    </span>
                    <input class="input" autoComplete="organization" value={contact.company} onInput={(e) => setContact({ ...contact, company: (e.target as HTMLInputElement).value })} />
                  </label>
                </div>
                <label class="field">
                  <span class="field-label">{s.message}</span>
                  <textarea class="input" rows={4} value={contact.message} onInput={(e) => setContact({ ...contact, message: (e.target as HTMLTextAreaElement).value })} />
                </label>
                <label class="flex gap-3 text-[0.92rem] text-ash">
                  <input type="checkbox" class="checkbox" checked={contact.privacy} onChange={(e) => setContact({ ...contact, privacy: (e.target as HTMLInputElement).checked })} />
                  <span>
                    {s.privacyBefore}
                    <a href={privacyHref} target="_blank" rel="noopener" class="text-brass-deep">
                      {s.privacyLink}
                    </a>
                    {s.privacyAfter}
                  </span>
                </label>
                {turnstileKey && <div class="cf-turnstile" data-sitekey={turnstileKey} data-language={lang} />}
                <button type="submit" class="btn btn-primary" disabled={busy}>
                  {busy ? s.sending : s.send}
                </button>
                {status && (
                  <p class={status.kind === 'err' ? 'text-danger' : 'text-success'} role="alert">
                    {status.text}
                  </p>
                )}
              </form>
            ))}
        </div>
      </fieldset>

      {step !== 'contact' && (
        <div class="mt-12 flex items-center justify-between gap-4 border-t border-stone pt-6">
          <button type="button" class="btn btn-outline btn-sm" disabled={i === 0} onClick={() => setI(Math.max(0, i - 1))}>
            {s.back}
          </button>
          <button type="button" class="btn btn-primary btn-sm" disabled={step === 'project' && !b.project} onClick={() => setI(Math.min(STEPS.length - 1, i + 1))}>
            {step === 'budget' ? s.seeProposals : s.next}
          </button>
        </div>
      )}
      {step === 'contact' && status?.kind !== 'ok' && (
        <button type="button" class="btn btn-outline btn-sm mt-8" onClick={() => setI(i - 1)}>
          {s.back}
        </button>
      )}
    </div>
  );
}
