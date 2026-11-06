/** @jsxImportSource react */
// Scheda del dipendente selezionato: ruolo, stato, attività, KPI, obiettivi, nuovo incarico,
// storico delle operazioni, memoria, note ricevute e (per l'amministratore) impostazioni.
import { useEffect, useState } from 'react';
import { ACTIVITY_LABEL, DATA_STATUS, STATUS_COLOR, STATUS_LABEL, TASK_STATUS, api, since, usd, when, type AgentView } from './types';

interface Detail {
  agent: Record<string, unknown>;
  tasks: { id: string; title: string; status: string; phase: string; result_summary: string | null; error: string | null; cost_usd: string; created_at: string; finished_at: string | null; created_by_agent: string | null }[];
  memory: { id: string; topic: string; content: string; data_status: string; source: string | null; created_at: string }[];
  shared: { id: string; topic: string; content: string; data_status: string; source: string | null; created_at: string }[];
  notes: { from_agent: string | null; subject: string; body: string; read_at: string | null; created_at: string }[];
  usage: { usd: string; input: string; output: string; calls: number };
}

const TABS = ['Attività', 'Storico', 'Memoria', 'Impostazioni'] as const;

export default function AgentPanel({ agent, connected, isAdmin, onOpenTask, onClose, onChanged, stamp }: {
  agent: AgentView;
  connected: boolean;
  isAdmin: boolean;
  onOpenTask: (id: string) => void;
  onClose: () => void;
  onChanged: () => void;
  stamp: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Attività');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<Detail>(`/api/admin/ai/agents/${agent.id}`).then((d) => alive && setDetail(d)).catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [agent.id, stamp]);
  useEffect(() => {
    setMsg(null);
    setTab('Attività');
  }, [agent.id]);

  async function assign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ id: string }>('/api/admin/ai/tasks', {
        method: 'POST',
        body: JSON.stringify({ agent_id: agent.id, title: f.get('title'), instructions: f.get('instructions'), priority: f.get('priority') }),
      });
      (e.target as HTMLFormElement).reset();
      setMsg(connected ? 'Incarico in coda: l’agente lo prenderà a breve.' : 'Incarico salvato in coda: partirà quando il servizio agenti sarà collegato.');
      onChanged();
      onOpenTask(r.id);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/api/admin/ai/agents/${agent.id}`, {
        method: 'POST',
        body: JSON.stringify({ enabled: f.get('enabled') === 'on', model: f.get('model'), effort: f.get('effort'), monthly_budget_usd: f.get('budget'), daily_task_limit: f.get('limit') }),
      });
      setMsg('Impostazioni salvate.');
      onChanged();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full max-h-[46rem] flex-col">
      <header className="border-b border-stone p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-brass-deep">{agent.team ?? agent.department}</p>
            <h2 className="font-display text-2xl leading-tight">{agent.name}</h2>
            <p className="text-[0.88rem] text-ash">{agent.title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[0.85rem] text-ash underline" aria-label="Chiudi la scheda">Chiudi</button>
        </div>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-ivory px-3 py-1 text-[0.82rem]">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[agent.status] }} />
          {STATUS_LABEL[agent.status]}
          {agent.status === 'working' && agent.activity && <> · {ACTIVITY_LABEL[agent.activity] ?? agent.activity}</>}
        </p>
        {agent.currentTask && (
          <button type="button" className="mt-2 block text-left text-[0.85rem] underline" onClick={() => onOpenTask(agent.currentTask!.id)}>
            In corso: {agent.currentTask.title} ({since(agent.currentTask.startedAt)})
          </button>
        )}
        <p className="mt-1 text-[0.78rem] text-ash">
          {agent.queued} in coda · {agent.waiting} in attesa · spesa del mese {usd(agent.costMonth)} di {usd(agent.monthlyBudget)}
        </p>
        <nav className="mt-4 flex gap-1 text-[0.82rem]" role="tablist">
          {TABS.filter((t) => t !== 'Impostazioni' || isAdmin).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`rounded px-2.5 py-1 ${tab === t ? 'bg-graphite text-marble' : 'bg-ivory'}`}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto p-5 text-[0.88rem]">
        {msg && <p className="mb-3 rounded bg-ivory px-3 py-2">{msg}</p>}
        {tab === 'Attività' && (
          <div className="space-y-5">
            <section>
              <h3 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">KPI</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                {agent.kpis.map((k) => (
                  <div key={k.key} className="rounded border border-stone bg-white/60 px-3 py-2">
                    <dt className="text-[0.72rem] text-ash">{k.label}</dt>
                    <dd className="font-display text-lg">{k.value === null ? '—' : k.key.includes('rate') ? `${k.value}%` : k.value.toLocaleString('it-IT')}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-1 text-[0.72rem] text-ash">Misure calcolate ora dal gestionale; «—» indica che non ci sono ancora dati.</p>
            </section>
            <section>
              <h3 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Obiettivi</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">{agent.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
            </section>
            {agent.last && (
              <section>
                <h3 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Ultimo risultato</h3>
                <button type="button" className="mt-2 block w-full rounded border border-stone bg-white/60 p-3 text-left" onClick={() => onOpenTask(agent.last!.id)}>
                  <span className="font-medium">{agent.last.title}</span> · {TASK_STATUS[agent.last.status] ?? agent.last.status} · {when(agent.last.finishedAt)}
                  {agent.last.summary && <span className="mt-1 block text-ash">{agent.last.summary}</span>}
                </button>
              </section>
            )}
            <section>
              <h3 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Nuovo incarico</h3>
              <form onSubmit={assign} className="mt-2 space-y-2">
                <input name="title" required minLength={3} maxLength={300} placeholder="Titolo" className="w-full rounded border border-stone bg-white px-3 py-2" aria-label="Titolo dell'incarico" />
                <textarea name="instructions" required minLength={3} rows={4} placeholder={agent.id === '01-ai-ceo' ? 'Es. Trova 30 importatori di marmo negli Emirati Arabi Uniti e prepara una strategia per acquisirne almeno 5' : 'Cosa deve fare, con quali criteri e in che formato'} className="w-full rounded border border-stone bg-white px-3 py-2" aria-label="Istruzioni" />
                <div className="flex items-center gap-3">
                  <label className="text-[0.8rem]">
                    Priorità{' '}
                    <select name="priority" defaultValue="5" className="rounded border border-stone bg-white px-2 py-1">
                      <option value="2">Alta</option>
                      <option value="5">Normale</option>
                      <option value="8">Bassa</option>
                    </select>
                  </label>
                  <button type="submit" className="btn btn-primary btn-sm ml-auto" disabled={busy || !agent.enabled}>Assegna</button>
                </div>
                <p className="text-[0.75rem] text-ash">
                  {agent.avgTaskCost !== null
                    ? `Costo medio di un incarico negli ultimi 30 giorni: ${usd(agent.avgTaskCost)} (le deleghe ai colleghi costano a parte).`
                    : 'Nessun incarico completato negli ultimi 30 giorni: il costo dipende da lunghezza e ricerche web (massimo 3 USD per incarico).'}
                </p>
                {!agent.enabled && <p className="text-[0.78rem] text-danger">Agente disattivato: riattivalo nelle impostazioni.</p>}
              </form>
            </section>
          </div>
        )}

        {tab === 'Storico' && (
          <ul className="space-y-2">
            {!detail?.tasks.length && <li className="text-ash">Nessun incarico ancora.</li>}
            {detail?.tasks.map((t) => (
              <li key={t.id}>
                <button type="button" className="block w-full rounded border border-stone bg-white/60 p-3 text-left" onClick={() => onOpenTask(t.id)}>
                  <span className="font-medium">{t.title}</span>
                  <span className="block text-[0.78rem] text-ash">
                    {TASK_STATUS[t.status] ?? t.status}
                    {t.phase === 'synthesis' ? ' · sintesi' : ''}
                    {t.created_by_agent ? ` · delegato da ${t.created_by_agent}` : ''} · {when(t.created_at)} · {usd(Number(t.cost_usd))}
                  </span>
                  {(t.result_summary || t.error) && <span className="mt-1 block text-[0.82rem]">{t.result_summary ?? t.error}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {tab === 'Memoria' && (
          <div className="space-y-5">
            {[['Memoria individuale', detail?.memory ?? []], ['Memoria aziendale (condivisa)', detail?.shared ?? []]].map(([label, list]) => (
              <section key={label as string}>
                <h3 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">{label as string}</h3>
                {!(list as Detail['memory']).length && <p className="mt-1 text-ash">Vuota.</p>}
                <ul className="mt-2 space-y-2">
                  {(list as Detail['memory']).map((m) => (
                    <li key={m.id} className="rounded border border-stone bg-white/60 p-3">
                      <p className="font-medium">{m.topic} <span className="text-[0.72rem] text-ash">· {DATA_STATUS[m.data_status] ?? m.data_status}</span></p>
                      <p className="mt-1 whitespace-pre-line">{m.content}</p>
                      {m.source && <p className="mt-1 break-all text-[0.75rem] text-ash">Fonte: {m.source}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <section>
              <h3 className="text-[0.72rem] uppercase tracking-[0.18em] text-ash">Note ricevute dai colleghi</h3>
              {!detail?.notes.length && <p className="mt-1 text-ash">Nessuna nota.</p>}
              <ul className="mt-2 space-y-2">
                {detail?.notes.map((n, i) => (
                  <li key={i} className="rounded border border-stone bg-white/60 p-3">
                    <p className="font-medium">{n.subject}</p>
                    <p className="text-[0.75rem] text-ash">da {n.from_agent ?? 'sistema'} · {when(n.created_at)} · {n.read_at ? 'letta' : 'da leggere'}</p>
                    <p className="mt-1 whitespace-pre-line">{n.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {tab === 'Impostazioni' && isAdmin && (
          <form onSubmit={save} className="space-y-3">
            <label className="flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={agent.enabled} /> Agente attivo</label>
            <label className="block">Modello<input name="model" defaultValue={agent.model} className="mt-1 w-full rounded border border-stone bg-white px-3 py-2" /></label>
            <label className="block">
              Livello di ragionamento
              <select name="effort" defaultValue={agent.effort} className="mt-1 w-full rounded border border-stone bg-white px-3 py-2">
                {['low', 'medium', 'high', 'xhigh', 'max'].map((e) => <option key={e}>{e}</option>)}
              </select>
            </label>
            <label className="block">Budget mensile (USD)<input name="budget" type="number" min="0" step="1" defaultValue={agent.monthlyBudget} className="mt-1 w-full rounded border border-stone bg-white px-3 py-2" /></label>
            <label className="block">Incarichi al giorno (massimo)<input name="limit" type="number" min="0" step="1" defaultValue={agent.dailyLimit} className="mt-1 w-full rounded border border-stone bg-white px-3 py-2" /></label>
            <p className="text-[0.78rem] text-ash">
              Consumo del mese: {usd(Number(detail?.usage.usd ?? 0))} · {detail?.usage.calls ?? 0} chiamate · {Number(detail?.usage.input ?? 0).toLocaleString('it-IT')} token in ingresso, {Number(detail?.usage.output ?? 0).toLocaleString('it-IT')} in uscita.
              Superato il budget, i nuovi incarichi dell'agente si fermano come «bloccati».
            </p>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Salva</button>
          </form>
        )}
      </div>
    </div>
  );
}
