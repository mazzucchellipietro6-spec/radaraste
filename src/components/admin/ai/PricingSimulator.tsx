/** @jsxImportSource react */
// Simulatore prezzi del pannello: stesso motore del servizio agenti (src/lib/pricing.ts).
// Ogni valore ha la sua qualità del dato; il risultato eredita quella più debole.
import { useMemo, useState } from 'react';
import { INCOTERMS, PricingError, simulate, type DataStatus, type Inputs } from '~/lib/pricing';
import { DATA_STATUS, api } from './types';

type Field = { key: string; label: string; unit?: string; optional?: boolean };
const RESALE: Field[] = [
  { key: 'quantity', label: 'Quantità', unit: 'm²' },
  { key: 'purchase_unit_cost', label: 'Costo d’acquisto unitario', unit: '€' },
  { key: 'processing_cost', label: 'Lavorazioni', unit: '€', optional: true },
  { key: 'packaging_cost', label: 'Imballaggio', unit: '€', optional: true },
  { key: 'freight_cost', label: 'Trasporto', unit: '€', optional: true },
  { key: 'insurance_rate', label: 'Assicurazione', unit: '% su merce + trasporto', optional: true },
  { key: 'duties_rate', label: 'Dazi (solo DDP)', unit: '%', optional: true },
  { key: 'taxes_rate', label: 'Imposte all’importazione (solo DDP)', unit: '%', optional: true },
  { key: 'payment_fee_rate', label: 'Commissioni di pagamento', unit: '% sul prezzo', optional: true },
  { key: 'target_margin_rate', label: 'Margine obiettivo', unit: '% sul prezzo' },
];
const BROKERAGE: Field[] = [
  { key: 'deal_value', label: 'Valore della compravendita intermediata', unit: '€' },
  { key: 'commission_rate', label: 'Commissione concordata', unit: '%' },
  { key: 'fixed_fee', label: 'Compenso fisso', unit: '€', optional: true },
  { key: 'travel_cost', label: 'Viaggi', unit: '€', optional: true },
  { key: 'samples_cost', label: 'Campioni', unit: '€', optional: true },
  { key: 'other_costs', label: 'Altri costi diretti', unit: '€', optional: true },
  { key: 'payment_fee_rate', label: 'Commissioni di pagamento', unit: '% sulla commissione', optional: true },
];
const STATUSES: DataStatus[] = ['verified', 'estimated', 'assumed', 'unknown'];
const eur = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);

export default function PricingSimulator() {
  const [model, setModel] = useState<'resale' | 'brokerage'>('resale');
  const [incoterm, setIncoterm] = useState('CIF');
  const [vals, setVals] = useState<Record<string, { value: string; status: DataStatus }>>({});
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const fields = model === 'resale' ? RESALE : BROKERAGE;

  const inputs: Inputs = useMemo(() => {
    const out: Inputs = { incoterm, currency: 'EUR', unit: 'm2' };
    for (const f of fields) {
      const v = vals[f.key];
      if (v && v.value.trim() !== '') out[f.key] = { value: Number(v.value.replace(',', '.')), status: v.status };
    }
    return out;
  }, [vals, fields, incoterm]);

  const result = useMemo(() => {
    try {
      return { ok: simulate(model, inputs) } as const;
    } catch (e) {
      return { error: e instanceof PricingError ? e.message : 'Dati non validi' } as const;
    }
  }, [model, inputs]);

  const set = (key: string, patch: Partial<{ value: string; status: DataStatus }>) =>
    setVals((v) => ({ ...v, [key]: { value: v[key]?.value ?? '', status: v[key]?.status ?? 'estimated', ...patch } }));

  async function save() {
    try {
      const r = await api<{ id: string }>('/api/admin/ai/pricing', { method: 'POST', body: JSON.stringify({ model, inputs, title }) });
      setSaved(`Simulazione salvata (${r.id.slice(0, 8)}): la trovi in Simulazioni di prezzo.`);
    } catch (e) {
      setSaved((e as Error).message);
    }
  }

  const out = 'ok' in result ? (result.ok as unknown as Record<string, unknown>) : null;
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
      <form className="space-y-4 rounded border border-stone bg-marble p-5" onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-wrap gap-3">
          {(['resale', 'brokerage'] as const).map((m) => (
            <label key={m} className={`cursor-pointer rounded px-3 py-1.5 ${model === m ? 'bg-graphite text-marble' : 'bg-ivory'}`}>
              <input type="radio" name="model" value={m} checked={model === m} onChange={() => setModel(m)} className="sr-only" />
              {m === 'resale' ? 'RESALE — acquisto e rivendita' : 'BROKERAGE — commissione'}
            </label>
          ))}
          {model === 'resale' && (
            <label className="ml-auto text-[0.88rem]">
              Incoterm{' '}
              <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)} className="rounded border border-stone bg-white px-2 py-1">
                {INCOTERMS.map((i) => <option key={i}>{i}</option>)}
              </select>
            </label>
          )}
        </div>
        <table className="w-full text-[0.88rem]">
          <thead>
            <tr className="text-left text-[0.72rem] uppercase tracking-[0.14em] text-ash"><th className="pb-2">Voce</th><th className="pb-2">Valore</th><th className="pb-2">Qualità del dato</th></tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className="border-t border-stone/60">
                <td className="py-2 pr-3">{f.label}{f.optional ? '' : ' *'}<span className="block text-[0.72rem] text-ash">{f.unit}</span></td>
                <td className="py-2 pr-3"><input inputMode="decimal" aria-label={f.label} value={vals[f.key]?.value ?? ''} onChange={(e) => set(f.key, { value: e.target.value })} className="w-32 rounded border border-stone bg-white px-2 py-1" /></td>
                <td className="py-2">
                  <select aria-label={`Qualità: ${f.label}`} value={vals[f.key]?.status ?? 'estimated'} onChange={(e) => set(f.key, { status: e.target.value as DataStatus })} className="rounded border border-stone bg-white px-2 py-1">
                    {STATUSES.map((s) => <option key={s} value={s}>{DATA_STATUS[s]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[0.78rem] text-ash">I valori facoltativi lasciati vuoti valgono zero e rendono il risultato un’ipotesi. «Verificato» solo se il valore viene da un documento (offerta del fornitore, quotazione del trasporto).</p>
      </form>

      <aside className="rounded border border-stone bg-marble p-5" aria-live="polite">
        <p className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Risultato</p>
        {'error' in result && <p className="mt-2 text-ash">{result.error}</p>}
        {out && model === 'resale' && (
          <dl className="mt-2 space-y-1 text-[0.9rem]">
            <div className="flex justify-between"><dt>Costo franco destinazione</dt><dd>{eur(out.landed_cost as number)}</dd></div>
            <div className="flex justify-between font-display text-xl"><dt>Prezzo di vendita</dt><dd>{eur(out.sale_price_total as number)}</dd></div>
            <div className="flex justify-between"><dt>Prezzo unitario</dt><dd>{eur(out.unit_price as number)}</dd></div>
            <div className="flex justify-between"><dt>Margine lordo</dt><dd>{eur(out.gross_margin as number)} ({String(out.gross_margin_rate)}%)</dd></div>
            <div className="flex justify-between text-ash"><dt>Commissioni di pagamento</dt><dd>{eur(out.payment_fees as number)}</dd></div>
          </dl>
        )}
        {out && model === 'brokerage' && (
          <dl className="mt-2 space-y-1 text-[0.9rem]">
            <div className="flex justify-between text-ash"><dt>Valore intermediato (non è ricavo)</dt><dd>{eur(out.gmv_intermediated as number)}</dd></div>
            <div className="flex justify-between font-display text-xl"><dt>Commissione (ricavo)</dt><dd>{eur(out.commission_revenue as number)}</dd></div>
            <div className="flex justify-between"><dt>Costi diretti</dt><dd>{eur(out.direct_costs as number)}</dd></div>
            <div className="flex justify-between"><dt>Contributo netto</dt><dd>{eur(out.net_contribution as number)} ({String(out.effective_rate)}%)</dd></div>
          </dl>
        )}
        {out && (
          <>
            <p className="mt-3 rounded bg-ivory px-3 py-1.5 text-[0.85rem]">Qualità del risultato: <strong>{DATA_STATUS[out.data_status as string]}</strong></p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.8rem] text-ash">{(out.warnings as string[]).map((w) => <li key={w}>{w}</li>)}</ul>
            <label className="mt-4 block text-[0.85rem]">Titolo<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border border-stone bg-white px-3 py-2" placeholder="Es. Calacatta 2 cm CIF Jebel Ali" /></label>
            <button type="button" className="btn btn-primary btn-sm mt-3" onClick={save}>Salva la simulazione</button>
          </>
        )}
        {saved && <p className="mt-3 text-[0.85rem]">{saved}</p>}
      </aside>
    </div>
  );
}
