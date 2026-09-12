'use client';

// Agentit — Hetki Companyn asiakashankinta-agenttien näkymä.
// Näyttää miten agentit toimivat (kartta), mitä ne saavat aikaan (ajot ja mittarit)
// ja mitä Anton päättää seuraavaksi. Agentit itse pyörivät Mac minillä (repo hetki-myynti).

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useOrgData } from '@/lib/firestore';
import { useIsMobile } from '@/lib/use-mobile';
import { useToast } from '@/lib/toast';
import TabSwitcher from '@/components/TabSwitcher';
import {
  AGENT_DEFS, AGENT_BY_ID, SUB_AGENT_IDS, DATA_STORES, RUN_TYPE_META, RUN_STATUS_META,
  RESULT_KEYS, RESULT_LABELS, RUNS_KEY, METRICS_KEY, EMPTY_RUNS, DEFAULT_METRICS, MAX_RUNS,
  REQUESTS_KEY, FOCUS_KEY, PIPELINE_KEY, EMPTY_REQUESTS, DEFAULT_FOCUS, EMPTY_PIPELINE, MAX_REQUESTS,
  REQUEST_STATUS_META, STAGE_ORDER, STAGE_META,
  activeRuns, runsSince, sumResults, pendingDecisions, lastRunOfAgent,
  normalizeRun, toneVar, fmtRelative, fmtDateTime, fmtEurShort, useNow, runningRun, activeAgentOf, fmtClock, fmtDuration,
  activeRequests, openRequests, newRequestId, stageCounts, callList, fmtDay,
  type AgentId, type AgentRun, type AgentMetrics, type AgentRunResults, type RunType, type RunStatus, type DataStoreId, type AgentEvent,
  type AgentRequest, type AgentFocus, type PipelineMirror, type ProspectStage,
} from '@/lib/agents-shared';

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem 1.25rem',
};
const lbl: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--t3)',
};
const disp: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.04em',
};

function Pill({ text, color }: { text: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', border: `1px solid ${color || 'var(--border)'}`,
      color: color || 'var(--t2)', borderRadius: 'var(--r)', ...disp, fontSize: 10, letterSpacing: '.08em', whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

function Glyph({ id, size = 34 }: { id: AgentId; size?: number }) {
  const a = AGENT_BY_ID[id];
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: '50%', flex: 'none',
      background: toneVar(a.tone), color: 'var(--paper)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, lineHeight: 1,
    }}>{a.glyph}</span>
  );
}

function ResultChips({ results }: { results?: AgentRunResults }) {
  if (!results) return null;
  const items = RESULT_KEYS.filter(k => (results[k] || 0) > 0);
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {items.map(k => (
        <span key={k} style={{ fontSize: 12, color: 'var(--t2)', background: 'var(--elev)', border: '1px solid var(--border-l)', borderRadius: 'var(--r)', padding: '2px 8px' }}>
          <b style={{ color: 'var(--t1)', fontWeight: 600 }}>{results[k]}</b> {RESULT_LABELS[k]}
        </span>
      ))}
    </div>
  );
}

function EventList({ events, newestFirst = false, animate = false }: { events: AgentEvent[]; newestFirst?: boolean; animate?: boolean }) {
  const list = newestFirst ? [...events].reverse() : events;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {list.map((e, i) => {
        const a = e.agent ? AGENT_BY_ID[e.agent] : null;
        const isLatest = newestFirst ? i === 0 : i === list.length - 1;
        return (
          <li key={`${e.t}-${i}`} className={animate ? 'ag-fade' : undefined}
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, animationDelay: animate ? `${Math.min(i, 8) * 40}ms` : undefined, opacity: animate && !isLatest ? 0.75 : 1 }}>
            <span style={{ ...lbl, fontSize: 10, letterSpacing: '.06em', color: 'var(--t3)', minWidth: 58, paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmtClock(e.t)}</span>
            {a ? <span title={a.label}><Glyph id={a.id} size={18} /></span> : <span style={{ width: 18, height: 18, flex: 'none' }} />}
            <span style={{ color: isLatest && animate ? 'var(--t1)' : 'var(--t2)' }}>
              {a && <b style={{ fontWeight: 600, color: 'var(--t1)' }}>{a.label} </b>}{e.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Kartta ──────────────────────────────────────────────────────

const MAP_W = 980;
const MAP_H = 440;
const ANTON = { x: 20, y: 190, w: 150, h: 60 };
const MP = { x: 250, y: 170, w: 190, h: 100 };
const AG = { x: 530, w: 200, h: 56, ys: [22, 102, 182, 262, 342] };
const ST = { x: 820, w: 150, h: 64, ys: { pipeline: 60, gmail: 190, web: 320 } as Record<DataStoreId, number> };

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

function AgentMap({ selected, onSelect, lastRuns, activeAgent }: {
  selected: AgentId | null;
  onSelect: (id: AgentId | null) => void;
  lastRuns: Partial<Record<AgentId, AgentRun>>;
  activeAgent: AgentId | null;    // agentti, joka työskentelee juuri nyt (käynnissä oleva ajo)
}) {
  const dim = (ids: AgentId[]) => selected && !ids.includes(selected) ? 0.14 : 1;
  const edgeColor = (id: AgentId) => (selected === id || activeAgent === id) ? toneVar(AGENT_BY_ID[id].tone) : 'var(--ink3)';
  const flowing = (id: AgentId) => activeAgent === id;

  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width="100%" role="img" aria-label="Agenttien työnjako ja datavirrat"
      style={{ display: 'block', fontFamily: 'var(--font)', maxWidth: 1100 }}>
      <defs>
        <marker id="ag-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--ink3)" />
        </marker>
      </defs>

      {/* Lähetysvarmistus */}
      <rect x={AG.x - 20} y={6} width={AG.w + 40} height={MAP_H - 12} rx={0} fill="none" stroke="var(--pink)" strokeDasharray="4 4" strokeWidth={1} opacity={0.8} />
      <text x={AG.x - 12} y={MAP_H - 16} fill="var(--pink)" fontSize={9.5} letterSpacing=".12em" style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>
        Hook estää: send, reply, forward, trash
      </text>

      {/* Anton <-> Myyntipäällikkö */}
      <line x1={ANTON.x + ANTON.w} y1={ANTON.y + 22} x2={MP.x} y2={MP.y + 32} stroke="var(--ink3)" strokeWidth={1.2} markerEnd="url(#ag-arr)" opacity={selected ? 0.3 : 1} />
      <line x1={MP.x} y1={MP.y + 68} x2={ANTON.x + ANTON.w} y2={ANTON.y + 38} stroke="var(--ink3)" strokeWidth={1.2} markerEnd="url(#ag-arr)" opacity={selected ? 0.3 : 1} />
      <text x={(ANTON.x + ANTON.w + MP.x) / 2} y={MP.y + 22} textAnchor="middle" fill="var(--t3)" fontSize={10.5}>ohjeet, päätökset</text>
      <text x={(ANTON.x + ANTON.w + MP.x) / 2} y={MP.y + 84} textAnchor="middle" fill="var(--t3)" fontSize={10.5}>raportit, kysymykset</text>

      {/* Myyntipäällikkö -> aliagentit */}
      {SUB_AGENT_IDS.map((id, i) => {
        const cy = AG.ys[i] + AG.h / 2;
        return (
          <path key={`mp-${id}`} d={curve(MP.x + MP.w, MP.y + MP.h / 2, AG.x, cy)} fill="none"
            className={flowing(id) ? 'ag-flow' : undefined}
            stroke={edgeColor(id)} strokeWidth={selected === id || flowing(id) ? 2 : 1.2} markerEnd="url(#ag-arr)" opacity={dim([id, 'myyntipaallikko'])} />
        );
      })}

      {/* Aliagentit -> tietolähteet */}
      {SUB_AGENT_IDS.map((id, i) => {
        const a = AGENT_BY_ID[id];
        const cy = AG.ys[i] + AG.h / 2;
        const edges: { store: DataStoreId; write: boolean }[] = [];
        for (const s of a.writesTo) edges.push({ store: s, write: true });
        for (const s of a.readsFrom) if (!a.writesTo.includes(s)) edges.push({ store: s, write: false });
        return edges.map(e => {
          const sy = ST.ys[e.store] + ST.h / 2;
          return (
            <path key={`${id}-${e.store}`} d={curve(AG.x + AG.w, cy, ST.x, sy)} fill="none"
              className={flowing(id) && e.write ? 'ag-flow' : undefined}
              stroke={edgeColor(id)} strokeWidth={selected === id || flowing(id) ? 2 : 1}
              strokeDasharray={e.write ? undefined : '3 4'}
              markerEnd={e.write ? 'url(#ag-arr)' : undefined}
              opacity={dim([id]) * (selected === id || flowing(id) ? 1 : 0.55)} />
          );
        });
      })}

      {/* Anton */}
      <g opacity={selected ? 0.5 : 1}>
        <rect x={ANTON.x} y={ANTON.y} width={ANTON.w} height={ANTON.h} fill="var(--card)" stroke="var(--rule)" />
        <text x={ANTON.x + 14} y={ANTON.y + 26} fill="var(--t1)" fontSize={13} style={disp}>Anton</text>
        <text x={ANTON.x + 14} y={ANTON.y + 44} fill="var(--t3)" fontSize={10.5}>puhelin, claude.ai, Code</text>
      </g>

      {/* Myyntipäällikkö */}
      <g onClick={() => onSelect(selected === 'myyntipaallikko' ? null : 'myyntipaallikko')} style={{ cursor: 'pointer' }} opacity={dim(['myyntipaallikko', ...SUB_AGENT_IDS])}>
        <rect x={MP.x} y={MP.y} width={MP.w} height={MP.h} fill="var(--card)" stroke={selected === 'myyntipaallikko' ? toneVar('blue') : 'var(--rule)'} strokeWidth={selected === 'myyntipaallikko' ? 2 : 1} />
        <rect x={MP.x} y={MP.y} width={6} height={MP.h} fill={toneVar('blue')} />
        {activeAgent === 'myyntipaallikko' && (
          <>
            <circle className="ag-pulse" cx={MP.x + MP.w - 16} cy={MP.y + 16} r={6} fill={toneVar('blue')} />
            <circle cx={MP.x + MP.w - 16} cy={MP.y + 16} r={4} fill={toneVar('blue')} />
          </>
        )}
        <text x={MP.x + 18} y={MP.y + 28} fill="var(--t1)" fontSize={13} style={disp}>Myyntipäällikkö</text>
        <text x={MP.x + 18} y={MP.y + 46} fill="var(--t3)" fontSize={10.5}>Mac mini, Remote Control</text>
        <text x={MP.x + 18} y={MP.y + 62} fill="var(--t3)" fontSize={10.5}>jakaa työn, kokoaa, raportoi</text>
        <text x={MP.x + 18} y={MP.y + 86} fill="var(--t2)" fontSize={10.5}>
          {lastRuns.myyntipaallikko ? `ajoi ${fmtRelative(Date.parse(lastRuns.myyntipaallikko.date))}` : 'ei ajoja vielä'}
        </text>
      </g>

      {/* Aliagentit */}
      {SUB_AGENT_IDS.map((id, i) => {
        const a = AGENT_BY_ID[id];
        const y = AG.ys[i];
        const sel = selected === id;
        const act = activeAgent === id;
        const last = lastRuns[id];
        return (
          <g key={id} onClick={() => onSelect(sel ? null : id)} style={{ cursor: 'pointer' }} opacity={dim([id])}>
            <rect x={AG.x} y={y} width={AG.w} height={AG.h} fill="var(--card)" stroke={sel || act ? toneVar(a.tone) : 'var(--rule)'} strokeWidth={sel || act ? 2 : 1} />
            <rect x={AG.x} y={y} width={6} height={AG.h} fill={toneVar(a.tone)} />
            {act && (
              <>
                <circle className="ag-pulse" cx={AG.x + AG.w - 16} cy={y + 14} r={6} fill={toneVar(a.tone)} />
                <circle cx={AG.x + AG.w - 16} cy={y + 14} r={4} fill={toneVar(a.tone)} />
              </>
            )}
            <text x={AG.x + 18} y={y + 22} fill="var(--t1)" fontSize={12} style={disp}>{a.label}</text>
            <text x={AG.x + 18} y={y + 40} fill={act ? 'var(--t1)' : 'var(--t3)'} fontSize={10.5}>
              {act ? 'työskentelee nyt' : last ? `ajoi ${fmtRelative(Date.parse(last.date))}` : a.role.length > 34 ? a.role.slice(0, 32) + '…' : a.role}
            </text>
          </g>
        );
      })}

      {/* Tietolähteet */}
      {DATA_STORES.map(s => {
        const y = ST.ys[s.id];
        const related = selected ? (AGENT_BY_ID[selected].writesTo.includes(s.id) || AGENT_BY_ID[selected].readsFrom.includes(s.id)) : true;
        return (
          <g key={s.id} opacity={related ? 1 : 0.2}>
            <rect x={ST.x} y={y} width={ST.w} height={ST.h} fill="var(--paper-d)" stroke="var(--rule)" />
            <text x={ST.x + 12} y={y + 24} fill="var(--t1)" fontSize={11.5} style={disp}>{s.label}</text>
            <text x={ST.x + 12} y={y + 42} fill="var(--t3)" fontSize={9.5}>{s.id === 'pipeline' ? 'totuuden lähde' : s.id === 'gmail' ? 'vain luonnokset' : 'vain luku'}</text>
          </g>
        );
      })}

      {/* Selite */}
      <g fontSize={10} fill="var(--t3)">
        <line x1={20} y1={MAP_H - 30} x2={50} y2={MAP_H - 30} stroke="var(--ink3)" strokeWidth={1.2} markerEnd="url(#ag-arr)" />
        <text x={56} y={MAP_H - 26}>kirjoittaa</text>
        <line x1={120} y1={MAP_H - 30} x2={150} y2={MAP_H - 30} stroke="var(--ink3)" strokeWidth={1} strokeDasharray="3 4" />
        <text x={156} y={MAP_H - 26}>lukee</text>
        <text x={210} y={MAP_H - 26}>Klikkaa agenttia nähdäksesi sen reitit.</text>
      </g>
    </svg>
  );
}

// ── Lomake: kirjaa ajo käsin ─────────────────────────────────────

interface RunForm {
  type: RunType;
  status: RunStatus;
  agents: AgentId[];
  date: string;
  summary: string;
  decisions: string;
  durationMin: string;
  results: Record<string, string>;
}

function nowLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const EMPTY_FORM: RunForm = {
  type: 'tuntiajo', status: 'ok', agents: ['myyntipaallikko'], date: '', summary: '', decisions: '', durationMin: '', results: {},
};

function RunFormView({ onSave, onCancel }: { onSave: (r: AgentRun) => void; onCancel: () => void }) {
  const [f, setF] = useState<RunForm>({ ...EMPTY_FORM, date: nowLocal() });
  const set = <K extends keyof RunForm>(k: K, v: RunForm[K]) => setF(p => ({ ...p, [k]: v }));
  const toggleAgent = (id: AgentId) => set('agents', f.agents.includes(id) ? f.agents.filter(a => a !== id) : [...f.agents, id]);
  const pickType = (t: RunType) => setF(p => ({ ...p, type: t, agents: RUN_TYPE_META[t].agents }));

  const save = () => {
    if (!f.summary.trim()) return;
    const results: Record<string, number> = {};
    for (const k of RESULT_KEYS) if (f.results[k]) results[k] = Number(f.results[k]);
    onSave(normalizeRun({
      type: f.type,
      status: f.status,
      agents: f.agents,
      date: f.date ? new Date(f.date).toISOString() : new Date().toISOString(),
      summary: f.summary,
      decisions: f.decisions.split('\n').map(s => s.trim()).filter(Boolean),
      durationMin: f.durationMin ? Number(f.durationMin) : undefined,
      results,
      source: 'manual',
    }));
  };

  return (
    <div style={{ ...card, borderColor: 'var(--pri)', marginBottom: 16 }}>
      <div style={{ ...lbl, marginBottom: 12 }}>Kirjaa ajo käsin</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Ajotyyppi</label>
          <select className="input" value={f.type} onChange={e => pickType(e.target.value as RunType)}>
            {(Object.keys(RUN_TYPE_META) as RunType[]).map(t => <option key={t} value={t}>{RUN_TYPE_META[t].label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Tila</label>
          <select className="input" value={f.status} onChange={e => set('status', e.target.value as RunStatus)}>
            {(Object.keys(RUN_STATUS_META) as RunStatus[]).map(s => <option key={s} value={s}>{RUN_STATUS_META[s].label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Alkoi</label>
          <input className="input" type="datetime-local" value={f.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Kesto (min)</label>
          <input className="input" type="number" min={0} value={f.durationMin} onChange={e => set('durationMin', e.target.value)} />
        </div>
      </div>

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Agentit</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AGENT_DEFS.map(a => {
            const on = f.agents.includes(a.id);
            return (
              <button key={a.id} type="button" onClick={() => toggleAgent(a.id)} className="btn btn-sm"
                style={{ background: on ? toneVar(a.tone) : 'var(--elev)', color: on ? 'var(--paper)' : 'var(--t2)', border: '1px solid var(--border)' }}>
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Mitä tehtiin</label>
        <textarea className="input textarea" rows={3} value={f.summary} onChange={e => set('summary', e.target.value)} placeholder="Lyhyesti: mitä ajettiin ja mitä syntyi." />
      </div>

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Tulokset</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {RESULT_KEYS.map(k => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--t3)' }}>
              {RESULT_LABELS[k]}
              <input className="input" type="number" min={0} style={{ padding: '.4rem .6rem' }} value={f.results[k] || ''}
                onChange={e => set('results', { ...f.results, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Päätökset Antonille (yksi per rivi)</label>
        <textarea className="input textarea" rows={2} value={f.decisions} onChange={e => set('decisions', e.target.value)} placeholder="Jätä tyhjäksi jos mitään ei tarvitse päättää." />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>Peru</button>
        <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={!f.summary.trim()}>Tallenna ajo</button>
      </div>
    </div>
  );
}

// ── Mittarilomake ────────────────────────────────────────────────

function MetricsForm({ value, onSave, onCancel }: { value: AgentMetrics; onSave: (m: AgentMetrics) => void; onCancel: () => void }) {
  const [m, setM] = useState<AgentMetrics>({ ...value });
  const num = (k: keyof AgentMetrics) => (
    <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--t3)' }}>
      {METRIC_LABELS[k]}
      <input className="input" type="number" min={0} style={{ padding: '.4rem .6rem' }} value={(m[k] as number | undefined) ?? ''}
        onChange={e => setM(p => ({ ...p, [k]: e.target.value === '' ? undefined : Number(e.target.value) }))} />
    </label>
  );
  return (
    <div style={{ ...card, borderColor: 'var(--pri)' }}>
      <div style={{ ...lbl, marginBottom: 12 }}>Muokkaa mittareita</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        {(['lahetetty', 'vastannut', 'kiinnostunut', 'tapaaminen', 'voitettuEur', 'tarjousEur', 'keskusteluEur', 'tavoiteEur'] as (keyof AgentMetrics)[]).map(num)}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--t3)' }}>
          Tavoitteen nimi
          <input className="input" style={{ padding: '.4rem .6rem' }} value={m.tavoiteNimi || ''} onChange={e => setM(p => ({ ...p, tavoiteNimi: e.target.value }))} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--t3)' }}>
          Määräpäivä
          <input className="input" type="date" style={{ padding: '.4rem .6rem' }} value={m.deadline || ''} onChange={e => setM(p => ({ ...p, deadline: e.target.value }))} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>Peru</button>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => onSave({ ...m, updatedAt: Date.now() })}>Tallenna</button>
      </div>
    </div>
  );
}

const METRIC_LABELS: Partial<Record<keyof AgentMetrics, string>> = {
  lahetetty: 'Lähetetty', vastannut: 'Vastannut', kiinnostunut: 'Kiinnostunut', tapaaminen: 'Tapaaminen',
  voitettuEur: 'Voitettu €', tarjousEur: 'Tarjouksissa €', keskusteluEur: 'Keskustelussa €', tavoiteEur: 'Tavoite €',
};

// ── Pääkomponentti ───────────────────────────────────────────────

export default function AgentsSection() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const { canEdit } = useAuth();
  const isMobile = useIsMobile();
  const [reqType, setReqType] = useState<RunType>('tuntiajo');
  const [reqText, setReqText] = useState('');
  const [editFocus, setEditFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | 'soita' | ProspectStage>('all');
  const [openProspect, setOpenProspect] = useState<string | null>(null);
  const { toast } = useToast();
  const [rawRuns, setRuns, runsLoading] = useOrgData<AgentRun[]>(RUNS_KEY, EMPTY_RUNS);
  const [metrics, setMetrics] = useOrgData<AgentMetrics>(METRICS_KEY, DEFAULT_METRICS);
  const [rawRequests, setRequests] = useOrgData<AgentRequest[]>(REQUESTS_KEY, EMPTY_REQUESTS);
  const [focus, setFocus] = useOrgData<AgentFocus>(FOCUS_KEY, DEFAULT_FOCUS);
  const [pipeline] = useOrgData<PipelineMirror>(PIPELINE_KEY, EMPTY_PIPELINE);
  const { user } = useAuth();

  const [selected, setSelected] = useState<AgentId | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | RunType>('all');
  const [agentFilter, setAgentFilter] = useState<'all' | AgentId>('all');
  const [showForm, setShowForm] = useState(false);
  const [editMetrics, setEditMetrics] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const runs = useMemo(() => activeRuns(rawRuns || []), [rawRuns]);
  const anyRunning = useMemo(() => (rawRuns || []).some(r => r.status === 'kesken' && !r.deletedAt), [rawRuns]);
  const now = useNow(anyRunning ? 1000 : 60000);
  const live = useMemo(() => runningRun(runs, now), [runs, now]);
  const activeAgent = activeAgentOf(live);
  const [openEvents, setOpenEvents] = useState<Record<string, boolean>>({});
  const last7 = useMemo(() => runsSince(runs, 7, now), [runs, now]);
  const last30 = useMemo(() => runsSince(runs, 30, now), [runs, now]);
  const sums30 = useMemo(() => sumResults(last30), [last30]);
  const pending = useMemo(() => pendingDecisions(runs), [runs]);
  const lastRun = runs[0];
  const lastRuns = useMemo(() => {
    const out: Partial<Record<AgentId, AgentRun>> = {};
    for (const a of AGENT_DEFS) out[a.id] = lastRunOfAgent(runs, a.id);
    return out;
  }, [runs]);
  const requests = useMemo(() => activeRequests(rawRequests || []), [rawRequests]);
  const open = useMemo(() => openRequests(requests), [requests]);
  const counts = useMemo(() => stageCounts(pipeline || EMPTY_PIPELINE), [pipeline]);
  const calls = useMemo(() => callList(pipeline || EMPTY_PIPELINE, now), [pipeline, now]);
  const prospects = useMemo(() => {
    const list = (pipeline?.prospects || []);
    const f = stageFilter === 'all' ? list : stageFilter === 'soita' ? calls : list.filter(p => p.stage === stageFilter);
    return [...f].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [pipeline, stageFilter, calls]);

  const filtered = useMemo(() => runs.filter(r =>
    (typeFilter === 'all' || r.type === typeFilter) &&
    (agentFilter === 'all' || r.agents.includes(agentFilter)),
  ), [runs, typeFilter, agentFilter]);
  const shown = showAll ? filtered : filtered.slice(0, 20);

  const silentHours = lastRun ? (now - Date.parse(lastRun.date)) / 3600000 : Infinity;
  const macState = live
    ? { text: 'Ajo käynnissä', color: 'var(--green)' }
    : !lastRun
    ? { text: 'Ei ajoja vielä', color: 'var(--t3)' }
    : silentHours > 3
      ? { text: `Hiljaista ${Math.round(silentHours)} h`, color: 'var(--yellow)' }
      : { text: 'Pyörii', color: 'var(--green)' };

  const target = metrics.tavoiteEur || 0;
  const won = metrics.voitettuEur || 0;
  const offered = metrics.tarjousEur || 0;
  const talking = metrics.keskusteluEur || 0;
  const wonPct = target > 0 ? Math.min((won / target) * 100, 100) : 0;
  const offeredPct = target > 0 ? Math.min(((won + offered) / target) * 100, 100) : 0;
  const talkingPct = target > 0 ? Math.min(((won + offered + talking) / target) * 100, 100) : 0;
  const daysLeft = metrics.deadline ? Math.ceil((Date.parse(metrics.deadline) - now) / 86400000) : null;

  const addRun = (r: AgentRun) => {
    setRuns(prev => [r, ...activeRuns(prev || [])].slice(0, MAX_RUNS));
    setShowForm(false);
    toast('Ajo kirjattu', 'success');
  };
  const removeRun = (id: string) => {
    if (!window.confirm('Poistetaanko tämä ajo listalta?')) return;
    setRuns(prev => (prev || []).map(r => r.id === id ? { ...r, deletedAt: Date.now() } : r));
  };
  const sendRequest = () => {
    const r: AgentRequest = {
      id: newRequestId(), createdAt: Date.now(), createdBy: user?.displayName || user?.email || 'Anton',
      type: reqType, instructions: reqText.trim().slice(0, 4000), status: 'jonossa',
    };
    setRequests(prev => [r, ...(prev || [])].slice(0, MAX_REQUESTS));
    setReqText('');
    toast('Pyyntö jonossa. Mac mini aloittaa minuutin sisällä.', 'success');
  };
  const cancelRequest = (id: string) => {
    setRequests(prev => (prev || []).map(r => r.id === id && r.status === 'jonossa' ? { ...r, status: 'peruttu', finishedAt: Date.now() } : r));
  };
  const saveFocus = () => {
    setFocus({ kulma: focusDraft.trim().slice(0, 4000), updatedAt: Date.now(), updatedBy: user?.displayName || user?.email || 'Anton' });
    setEditFocus(false);
    toast('Kulma tallennettu. Seuraava ajo käyttää sitä.', 'success');
  };
  const resolveRun = (id: string) => {
    setRuns(prev => (prev || []).map(r => r.id === id ? { ...r, resolved: true, status: r.status === 'paatos' ? 'ok' : r.status } : r));
    toast('Merkitty käsitellyksi', 'success');
  };

  let secNo = 0;
  const num = () => String(++secNo).padStart(2, '0');

  if (orgSlug !== 'hetki-company') {
    return (
      <div style={card}>
        <div style={{ fontSize: 14, color: 'var(--t2)' }}>Agentit-moduuli on käytössä vain Hetki Companyn työtilassa.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Tilarivi */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        <div style={card}>
          <div style={lbl}>Mac mini</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span aria-hidden className={live ? 'ag-live' : undefined} style={{ width: 9, height: 9, borderRadius: '50%', background: macState.color, flex: 'none' }} />
            <span style={{ ...disp, fontSize: 15 }}>{macState.text}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            {lastRun ? `Viimeisin: ${RUN_TYPE_META[lastRun.type].label.toLowerCase()} ${fmtRelative(Date.parse(lastRun.date), now)}` : 'Kun myyntipäällikkö ajaa, ajo ilmestyy tähän.'}
          </div>
        </div>
        <div style={{ ...card, borderColor: pending.length ? 'var(--pink)' : 'var(--border)' }}>
          <div style={lbl}>Odottaa päätöstäsi</div>
          <div style={{ ...disp, fontSize: 15, marginTop: 6, color: pending.length ? 'var(--pink)' : 'var(--t1)' }}>
            {pending.length ? `${pending.length} ${pending.length === 1 ? 'asia' : 'asiaa'}` : 'Ei mitään'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            {pending.length ? 'Agentit eivät jatka näitä ilman sinua.' : 'Agentit jatkavat omillaan.'}
          </div>
        </div>
        <div style={card}>
          <div style={lbl}>Ajopyynnöt</div>
          <div style={{ ...disp, fontSize: 15, marginTop: 6 }}>
            {open.length ? `${open.filter(r => r.status === 'jonossa').length} jonossa, ${open.filter(r => r.status === 'kaynnissa').length} käynnissä` : 'Ei odottavia'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            Ajot käynnistetään tältä sivulta. Ei automaattista tuntiajoa.
          </div>
        </div>
      </div>

      {/* Nyt käynnissä */}
      {live && (
        <section>
          <div className="sec-h">
            <span className="t"><span className="n" style={{ color: 'var(--green)' }}>●</span>Nyt käynnissä</span>
            <span className="meta">{RUN_TYPE_META[live.type].label} · alkoi <b>{fmtClock(Date.parse(live.date))}</b> · <b>{fmtDuration(now - Date.parse(live.date))}</b></span>
          </div>
          <div className="ag-glow" style={{ ...card, borderColor: 'var(--pri)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              {AGENT_DEFS.filter(a => live.agents.includes(a.id) || a.id === activeAgent).map(a => {
                const act = a.id === activeAgent;
                return (
                  <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', border: `1px solid ${act ? toneVar(a.tone) : 'var(--border-l)'}`, borderRadius: 'var(--r)', opacity: act ? 1 : 0.6, transition: 'all .3s cubic-bezier(.16,1,.3,1)' }}>
                    <Glyph id={a.id} size={22} />
                    <span style={{ ...disp, fontSize: 11 }}>{a.label}</span>
                    {act && <span aria-hidden className="ag-live" style={{ width: 6, height: 6, borderRadius: '50%', background: toneVar(a.tone) }} />}
                  </span>
                );
              })}
            </div>
            {live.summary && <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 10 }}>{live.summary}</div>}
            {live.events && live.events.length > 0 ? (
              <EventList events={live.events} newestFirst animate />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>Odottaa ensimmäistä tapahtumaa.</div>
            )}
          </div>
        </section>
      )}

      {/* Luvut */}
      <div className="stats" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
        <div className="stat"><div className="stat-num">{last7.length}</div><div className="stat-lbl">ajoa 7 päivässä</div></div>
        <div className="stat"><div className="stat-num">{sums30.luonnokset}</div><div className="stat-lbl">luonnosta 30 päivässä</div></div>
        <div className="stat"><div className="stat-num">{sums30.vastaukset}</div><div className="stat-lbl">vastausta 30 päivässä</div></div>
        <div className="stat"><div className="stat-num">{sums30.uudetProspektit + sums30.tutkitut}</div><div className="stat-lbl">prospektia löydetty tai tutkittu</div></div>
      </div>

      {/* Päätökset */}
      {pending.length > 0 && (
        <section>
          <div className="sec-h"><span className="t"><span className="n">{num()}</span>Päätökset</span><span className="meta"><b>{pending.length}</b> avoinna</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(r => (
              <div key={r.id} style={{ ...card, borderLeft: '4px solid var(--pink)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{fmtDateTime(r.date)} · {RUN_TYPE_META[r.type].label} · {r.agents.map(a => AGENT_BY_ID[a].label).join(', ')}</div>
                  {canEdit && <button className="btn btn-ghost btn-sm" type="button" onClick={() => resolveRun(r.id)}>Merkitse käsitellyksi</button>}
                </div>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
                  {r.decisions!.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>Vastaa myyntipäällikölle puhelimesta tai claude.ai:sta. Se ei lähetä mitään ennen erillistä &quot;kyllä, lähetä&quot;.</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Aja agentti */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Aja agentti</span>
          <span className="meta">{canEdit ? 'pyyntö menee Mac minille' : 'vain luku'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 12 }}>
          <div style={card}>
            <div style={{ ...lbl, marginBottom: 8 }}>Ajotyyppi</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {(Object.keys(RUN_TYPE_META) as RunType[]).map(t => (
                <button key={t} type="button" className="btn btn-sm" onClick={() => setReqType(t)}
                  style={{ background: reqType === t ? 'var(--pri)' : 'var(--elev)', color: reqType === t ? '#fff' : 'var(--t2)', border: '1px solid var(--border)' }}>
                  {RUN_TYPE_META[t].label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12, lineHeight: 1.5 }}>{RUN_TYPE_META[reqType].detail}</div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Kulma ja ohjeet tälle ajolle</label>
              <textarea className="input textarea" rows={3} value={reqText} onChange={e => setReqText(e.target.value)}
                placeholder="Esimerkiksi: keskity Itävallan ja Saksan paviljonkeihin, ei uusia segmenttejä. Tyhjä = pysyvä kulma riittää." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>Mitään ei lähetetä. Luonnokset jäävät Gmailiin sinulle.</span>
              <button type="button" className="btn btn-primary btn-sm" disabled={!canEdit} onClick={sendRequest}>Käynnistä {RUN_TYPE_META[reqType].label.toLowerCase()}</button>
            </div>
          </div>
          <div style={card}>
            <div style={{ ...lbl, marginBottom: 8 }}>Viimeisimmät pyynnöt</div>
            {requests.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>Ei pyyntöjä vielä.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {requests.slice(0, 8).map(r => {
                  const m = REQUEST_STATUS_META[r.status];
                  return (
                    <div key={r.id} style={{ borderLeft: `3px solid ${m.color}`, paddingLeft: 10, fontSize: 12.5, lineHeight: 1.45 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ ...disp, fontSize: 11 }}>{RUN_TYPE_META[r.type].label}</span>
                        <Pill text={m.label} color={m.color} />
                        <span style={{ color: 'var(--t3)' }}>{fmtRelative(r.createdAt, now)}</span>
                        {r.status === 'jonossa' && canEdit && (
                          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '.1rem .4rem', marginLeft: 'auto' }} onClick={() => cancelRequest(r.id)}>Peru</button>
                        )}
                      </div>
                      {r.instructions && <div style={{ color: 'var(--t2)', marginTop: 2 }}>{r.instructions.length > 160 ? r.instructions.slice(0, 158) + '…' : r.instructions}</div>}
                      {r.note && <div style={{ color: r.status === 'virhe' ? 'var(--red)' : 'var(--t3)', marginTop: 2 }}>{r.note}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Kulma */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Kulma ja ohjeet</span>
          <span className="meta">{focus.updatedAt ? <>päivitetty <b>{fmtRelative(focus.updatedAt, now)}</b></> : 'oletus'}</span>
        </div>
        <div style={{ ...card, borderColor: editFocus ? 'var(--pri)' : 'var(--border)' }}>
          {editFocus ? (
            <>
              <textarea className="input textarea" rows={6} value={focusDraft} onChange={e => setFocusDraft(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditFocus(false)}>Peru</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={saveFocus}>Tallenna kulma</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{focus.kulma || DEFAULT_FOCUS.kulma}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>Myyntipäällikkö lukee tämän jokaisen ajon alussa. Ajokohtainen ohje täydentää, ei korvaa.</span>
                {canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFocusDraft(focus.kulma || DEFAULT_FOCUS.kulma); setEditFocus(true); }}>Muokkaa</button>}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Pipeline */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Pipeline</span>
          <span className="meta">
            {pipeline?.syncedAt ? <><b>{pipeline.prospects.length}</b> prospektia · päivitetty <b>{fmtRelative(pipeline.syncedAt, now)}</b></> : 'ei vielä peilattu'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(9, 1fr)', gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => setStageFilter('soita')} style={{ ...card, padding: '.7rem .8rem', textAlign: 'left', cursor: 'pointer', borderColor: stageFilter === 'soita' ? 'var(--pri)' : calls.length ? 'var(--hetki-yellow)' : 'var(--border)' }}>
            <div style={{ ...disp, fontSize: 20 }}>{calls.length}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>soita tänään</div>
          </button>
          {STAGE_ORDER.map(st => (
            <button key={st} type="button" onClick={() => setStageFilter(stageFilter === st ? 'all' : st)} style={{ ...card, padding: '.7rem .8rem', textAlign: 'left', cursor: 'pointer', borderColor: stageFilter === st ? 'var(--pri)' : 'var(--border)', borderTop: `3px solid ${STAGE_META[st].color}` }}>
              <div style={{ ...disp, fontSize: 20 }}>{counts[st]}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{STAGE_META[st].label.toLowerCase()}</div>
            </button>
          ))}
        </div>
        {stageFilter !== 'all' && (
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>
            {stageFilter === 'soita' ? 'Lähetetyt, joiden soittopäivä on tänään tai aiemmin.' : STAGE_META[stageFilter].detail}{' '}
            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '.1rem .4rem' }} onClick={() => setStageFilter('all')}>Näytä kaikki</button>
          </div>
        )}
        {prospects.length === 0 ? (
          <div style={{ ...card, fontSize: 13, color: 'var(--t3)' }}>
            {pipeline?.prospects?.length ? 'Ei prospekteja tällä suodatuksella.' : 'Pipeline peilataan tänne, kun myyntipäällikkö ajaa seuraavan kerran. Totuuden lähde on Hetki Pipeline -artifact.'}
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  {['Organisaatio', 'Vaihe', 'Kontakti', 'Lähetetty', 'Seuraava', 'Arvo'].map(h => (
                    <th key={h} style={{ ...lbl, padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prospects.map(p => {
                  const isOpen = openProspect === p.id;
                  const due = p.nextDate && Date.parse(p.nextDate + 'T00:00:00') <= now;
                  return (
                    <React.Fragment key={p.id}>
                      <tr onClick={() => setOpenProspect(isOpen ? null : p.id)} style={{ cursor: 'pointer', background: isOpen ? 'var(--elev)' : undefined }}>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-l)', maxWidth: 320 }}>
                          <div style={{ fontWeight: 500 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--t3)' }}>{p.segment}</div>
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-l)' }}><Pill text={STAGE_META[p.stage].label} color={STAGE_META[p.stage].color} /></td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-l)', maxWidth: 260 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.contact || <span style={{ color: 'var(--t3)' }}>ei kontaktia</span>}</div>
                          {p.email && <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-l)', whiteSpace: 'nowrap' }}>{fmtDay(p.sentDate)}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-l)', maxWidth: 280 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: due ? 'var(--red)' : undefined }}>{p.nextDate ? `${fmtDay(p.nextDate)} ` : ''}{p.nextAction}</div>
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-l)', whiteSpace: 'nowrap' }}>{p.value ? fmtEurShort(p.value) : ''}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} style={{ padding: '10px 12px 14px', borderBottom: '1px solid var(--border-l)', background: 'var(--elev)', fontSize: 13, lineHeight: 1.55 }}>
                            {p.angle && <div style={{ marginBottom: 6 }}><span style={lbl}>Kulma</span> {p.angle}</div>}
                            {p.lastLog && <div style={{ marginBottom: 6 }}><span style={lbl}>Viimeisin merkintä {p.lastLog.date}</span> {p.lastLog.text}{p.logCount && p.logCount > 1 ? <span style={{ color: 'var(--t3)' }}> ({p.logCount} merkintää)</span> : null}</div>}
                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--t3)' }}>
                              {p.phone && <span>{p.phone}</span>}
                              {p.source && <a href={p.source} target="_blank" rel="noreferrer" style={{ color: 'var(--pri)' }}>lähde</a>}
                              {p.updatedAt && <span>päivitetty {fmtDay(p.updatedAt)}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pipeline?.strategy?.kokeilujono && pipeline.strategy.kokeilujono.length > 0 && (
          <div style={{ ...card, marginTop: 12 }}>
            <div style={{ ...lbl, marginBottom: 8 }}>Strategin kokeilujono</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
              {pipeline.strategy.kokeilujono.slice(0, 6).map((k, i) => <li key={i}>{k}</li>)}
            </ul>
          </div>
        )}
      </section>

      {/* Kartta */}
      <section>
        <div className="sec-h"><span className="t"><span className="n">{num()}</span>Näin ne toimivat</span><span className="meta">{activeAgent ? <><b>{AGENT_BY_ID[activeAgent].label}</b> työskentelee</> : selected ? <b>{AGENT_BY_ID[selected].label}</b> : 'yksi koordinaattori, viisi tekijää'}</span></div>
        {!isMobile ? (
          <div style={{ ...card, padding: '1rem' }}>
            <AgentMap selected={selected} onSelect={setSelected} lastRuns={lastRuns} activeAgent={activeAgent} />
          </div>
        ) : (
          <div style={{ ...card, fontSize: 13, lineHeight: 1.6, color: 'var(--t2)' }}>
            Anton antaa ohjeet puhelimesta. Myyntipäällikkö Mac minillä jakaa työn viidelle aliagentille ja raportoi takaisin.
            Aliagentit kirjoittavat Hetki Pipelineen ja Gmail-luonnoksiin. Hook estää lähetyksen kaikilta. Kartta näkyy leveämmällä näytöllä.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {DATA_STORES.map(s => (
            <div key={s.id} style={{ fontSize: 12, color: 'var(--t3)', flex: '1 1 220px' }}>
              <b style={{ color: 'var(--t2)', fontWeight: 600 }}>{s.label}.</b> {s.detail}
            </div>
          ))}
        </div>
      </section>

      {/* Agenttikortit */}
      <section>
        <div className="sec-h"><span className="t"><span className="n">{num()}</span>Agentit</span><span className="meta"><b>{AGENT_DEFS.length}</b> agenttia</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {AGENT_DEFS.map(a => {
            const sel = selected === a.id;
            const last = lastRuns[a.id];
            const n30 = last30.filter(r => r.agents.includes(a.id)).length;
            return (
              <div key={a.id} onClick={() => setSelected(sel ? null : a.id)} style={{
                ...card, cursor: 'pointer', borderColor: sel ? toneVar(a.tone) : 'var(--border)',
                gridColumn: sel && !isMobile ? 'span 2' : undefined, transition: 'border-color .15s',
              }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Glyph id={a.id} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <div style={{ ...disp, fontSize: 13 }}>{a.label}</div>
                      <Pill text={a.model} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{a.role}</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>
                      {last ? `Viimeksi ${fmtRelative(Date.parse(last.date), now)}` : 'Ei ajoja vielä'} · {n30} ajoa 30 pv
                    </div>
                  </div>
                </div>
                {sel && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--border-l)', paddingTop: 12, fontSize: 13, lineHeight: 1.55 }}>
                    <div style={{ color: 'var(--t2)', marginBottom: 12 }}>{a.description}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                      <div>
                        <div style={{ ...lbl, marginBottom: 6 }}>Tekee</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>{a.does.map((d, i) => <li key={i}>{d}</li>)}</ul>
                      </div>
                      <div>
                        <div style={{ ...lbl, marginBottom: 6, color: 'var(--pink)' }}>Ei koskaan</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>{a.never.map((d, i) => <li key={i}>{d}</li>)}</ul>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={lbl}>Työkalut</span>
                      {a.tools.map(t => <Pill key={t} text={t} />)}
                    </div>
                    {last && (
                      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t3)' }}>
                        <span style={lbl}>Viimeisin ajo</span> {fmtDateTime(last.date)}: {last.summary.length > 160 ? last.summary.slice(0, 158) + '…' : last.summary}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Mittarit */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Pipeline-mittarit</span>
          <span className="meta">{metrics.updatedAt ? <>päivitetty <b>{fmtRelative(metrics.updatedAt, now)}</b></> : 'strategi päivittää viikkokierroksella'}</span>
        </div>
        {editMetrics ? (
          <MetricsForm value={metrics} onSave={m => { setMetrics(m); setEditMetrics(false); toast('Mittarit tallennettu', 'success'); }} onCancel={() => setEditMetrics(false)} />
        ) : (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <div style={lbl}>{metrics.tavoiteNimi || 'Tavoite'}{daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft} pv jäljellä` : ''}</div>
              {canEdit && <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditMetrics(true)}>Muokkaa</button>}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ ...disp, fontSize: 26 }}>{fmtEurShort(won)}</span>
              <span style={{ color: 'var(--t3)', fontSize: 13 }}>voitettu / {fmtEurShort(target)}</span>
            </div>
            <div style={{ height: 12, background: 'var(--elev)', position: 'relative', overflow: 'hidden', marginTop: 10 }}>
              <div style={{ position: 'absolute', inset: 0, width: `${talkingPct}%`, background: 'var(--hetki-yellow)', opacity: .35 }} />
              <div style={{ position: 'absolute', inset: 0, width: `${offeredPct}%`, background: 'var(--hetki-blue)', opacity: .6 }} />
              <div style={{ position: 'absolute', inset: 0, width: `${wonPct}%`, background: 'var(--hetki-green)' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--t3)', flexWrap: 'wrap' }}>
              <span>Tarjouksissa <b style={{ color: 'var(--t1)', fontWeight: 600 }}>{fmtEurShort(offered)}</b></span>
              <span>Keskustelussa <b style={{ color: 'var(--t1)', fontWeight: 600 }}>{fmtEurShort(talking)}</b></span>
              <span>Puuttuu <b style={{ color: target - won - offered > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{fmtEurShort(Math.max(target - won - offered, 0))}</b></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 16 }}>
              {(['lahetetty', 'vastannut', 'kiinnostunut', 'tapaaminen'] as (keyof AgentMetrics)[]).map(k => (
                <div key={k} style={{ borderTop: '1px solid var(--border-l)', paddingTop: 8 }}>
                  <div style={{ ...disp, fontSize: 20 }}>{(metrics[k] as number | undefined) ?? 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{METRIC_LABELS[k]}</div>
                </div>
              ))}
            </div>
            {metrics.lahetetty !== undefined && metrics.lahetetty >= 8 && (metrics.vastannut || 0) < 2 && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--pink)' }}>Vähintään 8 viestiä ulkona ja alle 2 vastausta. Strategin pitäisi ehdottaa muutosta.</div>
            )}
          </div>
        )}
      </section>

      {/* Ajot */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Ajot</span>
          <span className="meta"><b>{filtered.length}</b> {filtered.length === 1 ? 'ajo' : 'ajoa'}{runsLoading ? ' · ladataan' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
          <TabSwitcher
            style={{ marginBottom: 0 }}
            active={typeFilter}
            onChange={id => setTypeFilter(id as 'all' | RunType)}
            tabs={[{ id: 'all', label: 'Kaikki' }, ...(Object.keys(RUN_TYPE_META) as RunType[]).map(t => ({ id: t, label: RUN_TYPE_META[t].short }))]}
          />
          <select className="input" style={{ width: 'auto', padding: '.45rem .8rem' }} value={agentFilter} onChange={e => setAgentFilter(e.target.value as 'all' | AgentId)}>
            <option value="all">Kaikki agentit</option>
            {AGENT_DEFS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {canEdit && !showForm && (
            <button className="btn btn-secondary btn-sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => setShowForm(true)}>Kirjaa ajo käsin</button>
          )}
        </div>
        <div style={{ height: 12 }} />
        {showForm && <RunFormView onSave={addRun} onCancel={() => setShowForm(false)} />}

        {shown.length === 0 ? (
          <div style={{ ...card, fontSize: 13, color: 'var(--t3)', lineHeight: 1.6 }}>
            {runs.length === 0
              ? 'Ei ajoja vielä. Kun myyntipäällikkö ajaa Mac minillä, se kirjaa ajon tänne skriptillä bin/kirjaa-ajo.sh. Voit myös kirjata ajon käsin.'
              : 'Ei ajoja tällä suodatuksella.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shown.map(r => {
              const st = RUN_STATUS_META[r.status];
              return (
                <div key={r.id} style={{ ...card, padding: '.85rem 1.1rem', borderLeft: `4px solid ${st.color}` }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ ...disp, fontSize: 12 }}>{fmtDateTime(r.date)}</span>
                    <Pill text={RUN_TYPE_META[r.type].label} />
                    <Pill text={r.status === 'kesken' && live?.id === r.id ? `${st.label} · ${fmtDuration(now - Date.parse(r.date))}` : st.label} color={st.color} />
                    {r.durationMin ? <span style={{ fontSize: 11, color: 'var(--t3)' }}>{r.durationMin} min</span> : null}
                    {r.source === 'manual' && <span style={{ fontSize: 11, color: 'var(--t3)' }}>käsin kirjattu</span>}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      {r.agents.map(a => <span key={a} title={AGENT_BY_ID[a].label} aria-label={AGENT_BY_ID[a].label}><Glyph id={a} size={20} /></span>)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8, whiteSpace: 'pre-wrap' }}>{r.summary}</div>
                  <ResultChips results={r.results} />
                  {r.events && r.events.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '.2rem .4rem' }}
                        onClick={e => { e.stopPropagation(); setOpenEvents(p => ({ ...p, [r.id]: !p[r.id] })); }}>
                        {openEvents[r.id] ? 'Piilota tapahtumat' : `Tapahtumat (${r.events.length})`}
                      </button>
                      {openEvents[r.id] && (
                        <div style={{ marginTop: 8, paddingLeft: 4, borderLeft: '2px solid var(--border-l)' }}>
                          <EventList events={r.events} />
                        </div>
                      )}
                    </div>
                  )}
                  {r.decisions && r.decisions.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, color: r.resolved ? 'var(--t3)' : 'var(--pink)' }}>
                      {r.resolved ? 'Päätetty: ' : 'Päätettävää: '}{r.decisions.join(' · ')}
                    </div>
                  )}
                  {canEdit && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
                      {r.status === 'paatos' && !r.resolved && <button className="btn btn-ghost btn-sm" type="button" onClick={() => resolveRun(r.id)}>Käsitelty</button>}
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeRun(r.id)}>Poista</button>
                    </div>
                  )}
                </div>
              );
            })}
            {!showAll && filtered.length > shown.length && (
              <button className="btn btn-ghost btn-sm" type="button" style={{ alignSelf: 'center' }} onClick={() => setShowAll(true)}>
                Näytä kaikki {filtered.length}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Miten data tulee tänne */}
      <section>
        <div className="sec-h"><span className="t"><span className="n">{num()}</span>Miten tämä sivu saa tietonsa</span></div>
        <div style={{ ...card, fontSize: 13, lineHeight: 1.6, color: 'var(--t2)' }}>
          <p style={{ margin: '0 0 8px' }}>
            Kun painat Käynnistä, pyyntö tallentuu tähän työtilaan. Mac minin vahti (<code>bin/vahti.sh</code>) hakee sen minuutin välein Cloud Functionilta <code>agentQueue</code>, lukee pysyvän kulman ja käynnistää myyntipäällikön. Ajon aikana myyntipäällikkö kirjaa tapahtumat skriptillä <code>bin/kirjaa-ajo.sh</code> funktiolle <code>logAgentRun</code>, ja lopuksi se peilaa Hetki Pipelinen sisällön tänne.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            Prospektien totuuden lähde on Hetki Pipeline -artifact. Tämän sivun Pipeline-osio on peili, joka päivittyy jokaisen ajon lopuksi. Muokkaukset tehdään artifactissa tai pyytämällä agenttia.
          </p>
          <p style={{ margin: 0 }}>
            Mitään ei lähde kenellekään tältä sivulta eikä agenteilta. Lähetys tapahtuu aina niin, että Anton avaa Gmail-luonnoksen ja lähettää sen itse.
          </p>
        </div>
      </section>
    </div>
  );
}
