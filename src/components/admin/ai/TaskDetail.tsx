/** @jsxImportSource react */
// Dettaglio di un incarico: istruzioni, risultato strutturato (fatti verificati, stime, ipotesi,
// incognite, rischi, fonti, record creati), colleghi coinvolti, approvazioni e cronologia completa.
import { useEffect, useState, type ReactNode } from 'react';
import { EVENT_LABEL, TASK_STATUS, api, usd, when, type AgentView } from './types';

interface Result {
  status?: string;
  summary?: string;
  verified_facts?: { fact: string; source_ids: string[] }[];
  estimates?: { item: string; value: string; basis: string }[];
  assumptions?: string[];
  unknowns?: string[];
  risks?: string[];
  source_ids?: string[];
  financial_impact?: { amount: number | null; currency: string; data_status: string; note: string };
  approval_required?: boolean;
  next_action?: string;
  report?: string;
  records?: { table: string; id: string; label: string }[];
  web_sources?: { url: string; title: string; retrieved_at: string }[];
}
interface Detail {
  task: Record<string, unknown> & { id: string; title: string; status: string; instructions: string; result: Result | null; error: string | null; agent_id: string; phase: string; cost_usd: string; input_tokens: string; output_tokens: string; attempts: number; created_at: string; finished_at: string | null; parent_id: string | null };
  events: { id: number; kind: string; activity: string | null; message: string | null; data: Record<string, unknown>; at: string }[];
  children: { id: string; agent_id: string; title: string; status: string; result_summary: string | null; error: string | null }[];
  approvals: { id: string; number: string; kind: string; title: string; status: string; amount: string | null; currency: string | null }[];
}

const List = ({ title, items }: { title: string; items?: ReactNode[] }) =>
  items && items.length ? (
    <section className="mt-4">
      <h4 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </section>
  ) : null;

export default function TaskDetail({ id, onClose, onOpenTask, onChanged, agents }: { id: string; onClose: () => void; onOpenTask: (id: string) => void; onChanged: () => void; agents: AgentView[] }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const name = (aid: string) => agents.find((a) => a.id === aid)?.name ?? aid;

  useEffect(() => {
    let alive = true;
    let t: number | undefined;
    const load = async () => {
      try {
        const x = await api<Detail>(`/api/admin/ai/tasks/${id}`);
        if (!alive) return;
        setD(x);
        if (['queued', 'running', 'waiting'].includes(x.task.status)) t = window.setTimeout(load, 3000);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    load();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [id]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  async function act(action: 'cancel' | 'retry') {
    try {
      await api(`/api/admin/ai/tasks/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
      onChanged();
      setD(await api<Detail>(`/api/admin/ai/tasks/${id}`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const r = d?.task.result ?? null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-graphite/40" role="dialog" aria-modal="true" aria-label="Dettaglio incarico" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-marble p-6 text-[0.9rem] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-brass-deep">Incarico · {d ? name(d.task.agent_id) : ''}</p>
            <h3 className="font-display text-2xl">{d?.task.title ?? 'Caricamento…'}</h3>
          </div>
          <button type="button" onClick={onClose} className="underline">Chiudi</button>
        </div>
        {err && <p className="mt-3 text-danger">{err}</p>}
        {d && (
          <>
            <p className="mt-2 text-ash">
              {TASK_STATUS[d.task.status] ?? d.task.status}
              {d.task.phase === 'synthesis' ? ' · fase di sintesi' : ''} · tentativi {d.task.attempts} · {usd(Number(d.task.cost_usd))} ·{' '}
              {Number(d.task.input_tokens).toLocaleString('it-IT')} + {Number(d.task.output_tokens).toLocaleString('it-IT')} token · creato {when(d.task.created_at)}
              {d.task.finished_at && <> · concluso {when(d.task.finished_at)}</>}
            </p>
            <div className="mt-3 flex gap-2">
              {['queued', 'running', 'waiting', 'blocked'].includes(d.task.status) && <button type="button" className="btn btn-outline btn-sm" onClick={() => act('cancel')}>Annulla</button>}
              {['failed', 'blocked'].includes(d.task.status) && <button type="button" className="btn btn-primary btn-sm" onClick={() => act('retry')}>Rimetti in coda</button>}
              {d.task.parent_id && <button type="button" className="underline" onClick={() => onOpenTask(d.task.parent_id!)}>Incarico principale</button>}
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-ash">Istruzioni</summary>
              <p className="mt-2 whitespace-pre-line">{d.task.instructions}</p>
            </details>
            {d.task.error && <p className="mt-4 rounded bg-danger/10 px-3 py-2 text-danger">{d.task.error}</p>}

            {r && (
              <section className="mt-5 rounded border border-stone bg-white/70 p-4">
                <h4 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Risultato</h4>
                <p className="mt-1 text-[0.98rem]">{r.summary}</p>
                <List title="Fatti verificati (con fonte)" items={r.verified_facts?.map((f) => <>{f.fact} <span className="break-all text-[0.75rem] text-ash">— {f.source_ids.join(', ')}</span></>)} />
                <List title="Stime" items={r.estimates?.map((e) => <>{e.item}: <strong>{e.value}</strong> <span className="text-ash">({e.basis})</span></>)} />
                <List title="Ipotesi" items={r.assumptions} />
                <List title="Da verificare / sconosciuto" items={r.unknowns} />
                <List title="Rischi" items={r.risks} />
                {r.financial_impact?.amount != null && (
                  <p className="mt-4">Impatto economico: {r.financial_impact.amount.toLocaleString('it-IT')} {r.financial_impact.currency} ({r.financial_impact.data_status}) {r.financial_impact.note}</p>
                )}
                {r.approval_required && <p className="mt-4 font-medium text-brass-deep">Richiede la tua approvazione: vedi Approvazioni.</p>}
                {r.next_action && <p className="mt-3"><span className="text-ash">Prossimo passo:</span> {r.next_action}</p>}
                <List title="Record creati nel gestionale" items={r.records?.map((x) => `${x.table}: ${x.label || x.id}`)} />
                <List title="Fonti web consultate" items={r.web_sources?.map((s) => <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all">{s.title || s.url}</a>)} />
                {r.report && (
                  <details className="mt-4">
                    <summary className="cursor-pointer">Rapporto completo</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-[0.86rem]">{r.report}</pre>
                  </details>
                )}
              </section>
            )}

            {d.children.length > 0 && (
              <section className="mt-5">
                <h4 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Colleghi coinvolti</h4>
                <ul className="mt-2 space-y-2">
                  {d.children.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="block w-full rounded border border-stone bg-white/60 p-3 text-left" onClick={() => onOpenTask(c.id)}>
                        <strong>{name(c.agent_id)}</strong> · {c.title} · {TASK_STATUS[c.status] ?? c.status}
                        {(c.result_summary || c.error) && <span className="block text-ash">{c.result_summary ?? c.error}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {d.approvals.length > 0 && (
              <section className="mt-5">
                <h4 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Approvazioni richieste</h4>
                <ul className="mt-2 space-y-1">
                  {d.approvals.map((a) => (
                    <li key={a.id}><a href={`/admin/approvals/#${a.id}`}>{a.number}</a> · {a.title} · {a.status}{a.amount ? ` · ${Number(a.amount).toLocaleString('it-IT')} ${a.currency ?? ''}` : ''}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-5">
              <h4 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Cronologia</h4>
              <ol className="mt-2 space-y-1 border-l border-stone pl-4">
                {d.events.map((e) => (
                  <li key={e.id}>
                    <span className="text-ash">{when(e.at)}</span> · <strong>{EVENT_LABEL[e.kind] ?? e.kind}</strong>
                    {e.kind === 'tool' && typeof e.data?.tool === 'string' ? ` ${e.data.tool}` : ''}
                    {e.message && e.kind !== 'tool' && <span className="block whitespace-pre-line text-ash">{e.message}</span>}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
