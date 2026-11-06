/** @jsxImportSource react */
// Sede virtuale e control room dell'azienda AI. Lo stato arriva dal database (API del pannello)
// ogni pochi secondi e, se il servizio agenti è pubblicato, in tempo reale tramite WebSocket.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgentPanel from './AgentPanel';
import ControlRoom from './ControlRoom';
import TaskDetail from './TaskDetail';
import { STATUS_COLOR, STATUS_LABEL, api, type CompanyState } from './types';

const Scene = lazy(() => import('./Scene'));

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function Headquarters({ initial, isAdmin }: { initial: CompanyState; isAdmin: boolean }) {
  const [state, setState] = useState<CompanyState>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [task, setTask] = useState<string | null>(null);
  const [live, setLive] = useState<'ws' | 'poll' | 'off'>('poll');
  const [error, setError] = useState<string | null>(null);
  const [gl, setGl] = useState<boolean | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // contenitore fisso per le etichette HTML della scena (evita di ricrearle quando la tela si monta)
  const labels = useRef<HTMLDivElement>(null) as React.MutableRefObject<HTMLDivElement>;

  const refresh = useCallback(async () => {
    try {
      setState(await api<CompanyState>('/api/admin/ai/state'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setGl(webglOk());
    // link diretti: /admin/ai/?agent=24-legal-counsel oppure ?task=<id>
    const q = new URLSearchParams(window.location.search);
    if (q.get('agent')) setSelected(q.get('agent'));
    if (q.get('task') && /^[0-9a-f-]{36}$/.test(q.get('task')!)) setTask(q.get('task'));
  }, []);

  // aggiornamento periodico (rallenta quando la scheda non è visibile)
  useEffect(() => {
    let stop = false;
    const loop = async () => {
      if (stop) return;
      if (document.visibilityState === 'visible') await refresh();
      timer.current = window.setTimeout(loop, live === 'ws' ? 15000 : 4000);
    };
    timer.current = window.setTimeout(loop, 4000);
    return () => {
      stop = true;
      window.clearTimeout(timer.current);
    };
  }, [refresh, live]);

  // tempo reale: il servizio agenti trasmette eventi e cambi di stato degli incarichi
  useEffect(() => {
    if (!state.wsUrl) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let pending: number | undefined;
    const connect = async () => {
      try {
        const { url } = await api<{ url: string }>('/api/admin/ai/ws-token');
        ws = new WebSocket(url);
        ws.onopen = () => setLive('ws');
        ws.onmessage = () => {
          window.clearTimeout(pending);
          pending = window.setTimeout(refresh, 400);
        };
        ws.onclose = () => {
          setLive('poll');
          if (!closed) window.setTimeout(connect, 8000);
        };
      } catch {
        setLive('poll');
      }
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(pending);
      ws?.close();
    };
  }, [state.wsUrl, refresh]);

  const agent = useMemo(() => state.agents.find((a) => a.id === selected) ?? null, [state.agents, selected]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of state.agents) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [state.agents]);
  const connected = state.runtime.online && state.runtime.llmConfigured;

  return (
    <div className="mt-6 space-y-6">
      {!connected && (
        <div role="status" className="rounded border border-brass/40 bg-marble px-4 py-3 text-[0.92rem]">
          <strong>Gli agenti non sono collegati.</strong>{' '}
          {!state.runtime.online
            ? 'Il servizio agenti non è in esecuzione (nessun segnale negli ultimi 45 secondi): gli incarichi restano in coda finché non viene avviato.'
            : 'Il servizio agenti è acceso ma manca la chiave API di Claude (ANTHROPIC_API_KEY): nessun agente può lavorare.'}{' '}
          Istruzioni: docs/AI-COMPANY.md, sezione «Avvio».
        </div>
      )}
      {error && <p className="text-[0.85rem] text-danger">Aggiornamento non riuscito: {error}</p>}

      <section aria-label="Sede virtuale 3D" className="relative min-h-[28rem] overflow-hidden rounded border border-stone bg-[#ece6db]" style={{ height: 'min(78vh, 52rem)' }}>
        {gl === false ? (
          <div className="grid h-full place-items-center p-6 text-center text-ash">Questo browser non supporta la grafica 3D (WebGL). Gli agenti sono elencati nella control room qui sotto.</div>
        ) : gl ? (
          <Suspense fallback={<div className="grid h-full place-items-center text-ash">Caricamento della sede…</div>}>
            <Scene state={state} selected={selected} onSelect={setSelected} portal={labels} />
          </Suspense>
        ) : null}
        <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
        <div className="pointer-events-none absolute left-3 top-3 z-30 flex max-w-[60%] flex-wrap gap-1.5 text-[0.72rem]">
          {Object.entries(counts).map(([s, n]) => (
            <span key={s} className="rounded-full bg-marble/90 px-2 py-0.5 shadow-sm">
              <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: STATUS_COLOR[s as keyof typeof STATUS_COLOR] }} />
              {STATUS_LABEL[s as keyof typeof STATUS_LABEL]}: {n}
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded bg-marble/85 px-2 py-1 text-[0.7rem] text-ash">
          {state.agents.length} agenti · {live === 'ws' ? 'tempo reale' : 'aggiornamento ogni 4 s'} · trascina per ruotare, zoom con la rotella o due dita, tocca un dipendente
        </div>
        {/* su schermi larghi la scheda dell'agente si apre sopra la sede, a destra */}
        <aside className="absolute bottom-3 right-3 top-3 z-30 hidden w-[25rem] overflow-hidden rounded border border-stone bg-marble/95 shadow-lg backdrop-blur lg:block" aria-live="polite" style={{ display: agent ? undefined : 'none' }}>
          {agent && <AgentPanel agent={agent} connected={connected} isAdmin={isAdmin} onOpenTask={setTask} onClose={() => setSelected(null)} onChanged={refresh} stamp={state.generatedAt} />}
        </aside>
        {!agent && (
          <div className="absolute right-3 top-3 z-30 hidden max-w-[19rem] rounded border border-stone bg-marble/95 p-4 text-[0.85rem] shadow-sm lg:block">
            <p className="font-display text-lg text-graphite">Seleziona un dipendente</p>
            <p className="mt-1 text-ash">Clicca un personaggio o un nome nella control room: ruolo, attività, memoria, KPI, storico e nuovo incarico.</p>
            <button type="button" className="btn btn-primary btn-sm mt-3" onClick={() => setSelected('01-ai-ceo')}>Apri l'AI CEO</button>
          </div>
        )}
      </section>
      {agent && (
        <aside className="rounded border border-stone bg-marble lg:hidden" aria-live="polite">
          <AgentPanel agent={agent} connected={connected} isAdmin={isAdmin} onOpenTask={setTask} onClose={() => setSelected(null)} onChanged={refresh} stamp={state.generatedAt} />
        </aside>
      )}

      <ControlRoom state={state} live={live} onSelect={setSelected} onOpenTask={setTask} />
      {task && <TaskDetail id={task} onClose={() => setTask(null)} onOpenTask={setTask} onChanged={refresh} agents={state.agents} />}
    </div>
  );
}
