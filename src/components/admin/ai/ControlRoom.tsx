/** @jsxImportSource react */
// Control room: stato del servizio, code, costi, ricavi rispetto all'obiettivo, reparti e flusso
// degli eventi in tempo reale. Funziona anche senza grafica 3D (elenco completo degli agenti).
import { useMemo } from 'react';
import { EVENT_LABEL, STATUS_COLOR, STATUS_LABEL, eur, since, usd, type CompanyState } from './types';

export default function ControlRoom({ state, live, onSelect, onOpenTask }: { state: CompanyState; live: string; onSelect: (id: string) => void; onOpenTask: (id: string) => void }) {
  const byId = useMemo(() => Object.fromEntries(state.agents.map((a) => [a.id, a])), [state.agents]);
  const f = state.finance;
  const pct = f ? Math.min(100, Math.round((f.total / (f.target || 1)) * 100)) : 0;
  const capPct = Math.min(100, Math.round((state.costs.today / (state.costs.dailyCap || 1)) * 100));
  const tile = 'rounded border border-stone bg-marble p-4';
  return (
    <section aria-label="Control room" className="space-y-4">
      <h2 className="font-display text-2xl">Control room</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={tile}>
          <p className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Servizio agenti</p>
          <p className="mt-1 font-display text-xl">{state.runtime.online ? 'Acceso' : 'Spento'}</p>
          <p className="text-[0.8rem] text-ash">
            Claude: {state.runtime.llmConfigured ? 'collegato' : 'non configurato'} · processi: {state.runtime.workers}
            {state.runtime.lastSeen && <> · segnale {since(state.runtime.lastSeen)}</>} · {live === 'ws' ? 'eventi in tempo reale' : 'aggiornamento periodico'}
          </p>
        </div>
        <div className={tile}>
          <p className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Incarichi</p>
          <p className="mt-1 font-display text-xl">{state.queue.running ?? 0} in corso · {state.queue.queued ?? 0} in coda</p>
          <p className="text-[0.8rem] text-ash">{state.queue.waiting ?? 0} in attesa dei colleghi · {state.queue.blocked ?? 0} bloccati · {state.queue.failed ?? 0} falliti</p>
        </div>
        <div className={tile}>
          <p className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Costi AI</p>
          <p className="mt-1 font-display text-xl">{usd(state.costs.today)} oggi</p>
          <div className="mt-1 h-1.5 rounded bg-stone"><div className="h-1.5 rounded bg-brass" style={{ width: `${capPct}%` }} /></div>
          <p className="mt-1 text-[0.8rem] text-ash">Tetto giornaliero {usd(state.costs.dailyCap)} · mese {usd(state.costs.month)}</p>
        </div>
        <a href="/admin/approvals/" className={`${tile} block no-underline hover:border-graphite`}>
          <p className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Approvazioni del fondatore</p>
          <p className="mt-1 font-display text-xl">{state.approvalsPending} in attesa</p>
          <p className="text-[0.8rem] text-ash">Acquisti, pagamenti, contratti, preventivi vincolanti, sconti, email: nulla parte senza la tua decisione.</p>
        </a>
      </div>

      {f && (
        <div className={tile}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Ricavi del mese (dal gestionale)</p>
            <p className="text-[0.78rem] text-ash">Obiettivo {eur(f.target)} al mese: è un obiettivo, non una previsione</p>
          </div>
          <p className="mt-1 font-display text-2xl">{eur(f.total)} <span className="text-[0.9rem] text-ash">({pct}% · mancano {eur(Math.max(0, f.gap))})</span></p>
          <div className="mt-2 h-2 rounded bg-stone"><div className="h-2 rounded bg-success" style={{ width: `${pct}%` }} /></div>
          <dl className="mt-3 grid gap-2 text-[0.85rem] sm:grid-cols-4">
            <div><dt className="text-ash">RESALE (vendite)</dt><dd>{eur(f.resale)}</dd></div>
            <div><dt className="text-ash">BROKERAGE (commissioni)</dt><dd>{eur(f.commissions)}</dd></div>
            <div><dt className="text-ash">Valore intermediato (non è ricavo)</dt><dd>{eur(f.gmv)}</dd></div>
            <div><dt className="text-ash">Incassato</dt><dd>{eur(f.cashIn)}</dd></div>
          </dl>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className={tile}>
          <p className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Reparti e dipendenti</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {state.departments.map((d) => (
              <div key={d.id}>
                <p className="text-[0.8rem] font-medium">{d.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {state.agents.filter((a) => a.department === d.id).map((a) => (
                    <li key={a.id}>
                      <button type="button" className="flex w-full items-center gap-2 text-left text-[0.83rem] hover:underline" onClick={() => onSelect(a.id)}>
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[a.status] }} />
                        <span className="truncate">{a.name}</span>
                        <span className="ml-auto shrink-0 text-[0.72rem] text-ash">{STATUS_LABEL[a.status]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className={tile}>
          <p className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Attività in tempo reale</p>
          <ol className="mt-3 max-h-[26rem] space-y-1.5 overflow-y-auto pr-1 text-[0.83rem]">
            {!state.events.length && <li className="text-ash">Nessuna attività registrata.</li>}
            {state.events.map((e) => (
              <li key={e.id} className="border-b border-stone/60 pb-1.5">
                <button type="button" className="w-full text-left" onClick={() => e.task_id && onOpenTask(e.task_id)}>
                  <span className="text-ash">{since(e.at)} · </span>
                  <strong>{(e.agent_id && byId[e.agent_id]?.name) || 'Sistema'}</strong> · {EVENT_LABEL[e.kind] ?? e.kind}
                  {e.message && <span className="block truncate text-ash">{e.message}</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
