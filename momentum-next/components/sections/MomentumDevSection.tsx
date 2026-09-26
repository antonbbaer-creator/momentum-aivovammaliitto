'use client';

// Momentum-kehitys — Momentumin omien ylläpito- ja kehitysagenttien näkymä Agentit-sivulla.
// Näyttää terveyden, ajot ja päätökset, ja välittää Antonin pyynnöt agenteille.
// Agentit itse ovat Claude Code -aliagentteja repossa (.claude/agents/momentum-*.md, agentit/README.md).

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useOrgData } from '@/lib/firestore';
import { useIsMobile } from '@/lib/use-mobile';
import { useToast } from '@/lib/toast';
import {
  REQUEST_STATUS_META, RUN_STATUS_META, toneVar, fmtRelative, fmtDateTime, fmtClock, fmtDuration, useNow,
  type AgentFocus,
} from '@/lib/agents-shared';
import {
  DEV_AGENT_DEFS, DEV_AGENT_BY_ID, DEV_RUN_TYPE_META, DEV_RESULT_LABELS, HEALTH_META,
  DEV_RUNS_KEY, DEV_REQUESTS_KEY, DEV_FOCUS_KEY, DEV_HEALTH_KEY, DEV_MAX_REQUESTS,
  EMPTY_DEV_RUNS, EMPTY_DEV_REQUESTS, EMPTY_HEALTH, DEFAULT_DEV_FOCUS,
  activeDevRuns, pendingDevDecisions, runningDevRun, newDevRequestId,
  type DevAgentId, type DevRun, type DevRequest, type DevHealth, type DevRunType, type DevRunResults, type DevEvent,
} from '@/lib/dev-agents-shared';

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

function Glyph({ id, size = 34 }: { id: DevAgentId; size?: number }) {
  const a = DEV_AGENT_BY_ID[id];
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: '50%', flex: 'none',
      background: toneVar(a.tone), color: 'var(--paper)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, lineHeight: 1,
    }}>{a.glyph}</span>
  );
}

function ResultChips({ results }: { results?: DevRunResults }) {
  if (!results) return null;
  const items = (Object.keys(DEV_RESULT_LABELS) as (keyof DevRunResults)[]).filter(k => (results[k] || 0) > 0);
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {items.map(k => (
        <span key={k} style={{ fontSize: 12, color: 'var(--t2)', background: 'var(--elev)', border: '1px solid var(--border-l)', borderRadius: 'var(--r)', padding: '2px 8px' }}>
          <b style={{ color: 'var(--t1)', fontWeight: 600 }}>{results[k]}</b> {DEV_RESULT_LABELS[k]}
        </span>
      ))}
    </div>
  );
}

function Events({ events, newestFirst = false }: { events: DevEvent[]; newestFirst?: boolean }) {
  const list = newestFirst ? [...events].reverse() : events;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {list.map((e, i) => {
        const a = e.agent ? DEV_AGENT_BY_ID[e.agent] : null;
        return (
          <li key={`${e.t}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45 }}>
            <span style={{ ...lbl, letterSpacing: '.06em', minWidth: 58, paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmtClock(e.t)}</span>
            {a ? <span title={a.label}><Glyph id={a.id} size={18} /></span> : <span style={{ width: 18, height: 18, flex: 'none' }} />}
            <span style={{ color: 'var(--t2)' }}>{a && <b style={{ fontWeight: 600, color: 'var(--t1)' }}>{a.label} </b>}{e.text}</span>
          </li>
        );
      })}
    </ol>
  );
}

function HealthCard({ health, now }: { health: DevHealth; now: number }) {
  const checks = health.checks || [];
  const [showOk, setShowOk] = useState(false);
  if (!checks.length) {
    return (
      <div style={{ ...card, fontSize: 13, color: 'var(--t3)', lineHeight: 1.6 }}>
        Ei terveysraporttia vielä. Huoltaja lähettää sen jokaisella huoltokierroksella (<code>node agentit/bin/kirjaa.mjs terveys</code>).
      </div>
    );
  }
  const order = { virhe: 0, varoitus: 1, ok: 2 } as const;
  const sorted = [...checks].sort((a, b) => order[a.status] - order[b.status]);
  const shown = showOk ? sorted : sorted.filter(c => c.status !== 'ok');
  const okCount = checks.filter(c => c.status === 'ok').length;
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 10 }}>
        {(['virhe', 'varoitus', 'ok'] as const).map(s => (
          <span key={s} style={{ fontSize: 13, color: 'var(--t2)' }}>
            <b style={{ color: HEALTH_META[s].color, fontWeight: 600 }}>{HEALTH_META[s].mark} {checks.filter(c => c.status === s).length}</b> {HEALTH_META[s].label.toLowerCase()}
          </span>
        ))}
        <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 'auto' }}>
          {health.ranAt ? fmtRelative(health.ranAt, now) : ''}{health.commit ? ` · ${health.commit}` : ''}{health.branch ? ` · ${health.branch}` : ''}
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(c => (
          <li key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45 }}>
            <span aria-label={HEALTH_META[c.status].label} style={{ color: HEALTH_META[c.status].color, fontWeight: 700, minWidth: 14 }}>{HEALTH_META[c.status].mark}</span>
            <span>
              <b style={{ fontWeight: 600, color: 'var(--t1)' }}>{c.label}</b>
              <span style={{ display: 'block', color: 'var(--t3)', fontSize: 12, wordBreak: 'break-word' }}>{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {okCount > 0 && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowOk(v => !v)}>
          {showOk ? 'Piilota kunnossa olevat' : `Näytä myös kunnossa olevat (${okCount})`}
        </button>
      )}
    </div>
  );
}

export default function MomentumDevSection() {
  const { canEdit, user } = useAuth();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [rawRuns, setRuns, runsLoading] = useOrgData<DevRun[]>(DEV_RUNS_KEY, EMPTY_DEV_RUNS);
  const [rawRequests, setRequests] = useOrgData<DevRequest[]>(DEV_REQUESTS_KEY, EMPTY_DEV_REQUESTS);
  const [focus, setFocus] = useOrgData<AgentFocus>(DEV_FOCUS_KEY, DEFAULT_DEV_FOCUS);
  const [health] = useOrgData<DevHealth>(DEV_HEALTH_KEY, EMPTY_HEALTH);

  const [reqType, setReqType] = useState<DevRunType>('kehitys');
  const [reqText, setReqText] = useState('');
  const [editFocus, setEditFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState('');
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showTeam, setShowTeam] = useState(false);

  const runs = useMemo(() => activeDevRuns(rawRuns || []), [rawRuns]);
  const anyRunning = runs.some(r => r.status === 'kesken');
  const now = useNow(anyRunning ? 1000 : 60000);
  const live = useMemo(() => runningDevRun(runs, now), [runs, now]);
  const pending = useMemo(() => pendingDevDecisions(runs), [runs]);
  const requests = useMemo(() => [...(rawRequests || [])].sort((a, b) => b.createdAt - a.createdAt), [rawRequests]);
  const openReqs = requests.filter(r => r.status === 'jonossa' || r.status === 'kaynnissa');
  const recentReqs = requests.filter(r => r.status !== 'jonossa' && r.status !== 'kaynnissa').slice(0, 5);
  const shown = showAll ? runs : runs.slice(0, 15);
  const lastRun = runs[0];
  const h = health || EMPTY_HEALTH;
  const healthState = !h.checks?.length
    ? { text: 'Ei raporttia', color: 'var(--t3)' }
    : (h.virhe || 0) > 0 ? { text: `${h.virhe} virhettä`, color: 'var(--red)' }
    : (h.varoitus || 0) > 0 ? { text: `${h.varoitus} varoitusta`, color: 'var(--yellow)' }
    : { text: 'Kunnossa', color: 'var(--green)' };

  const who = user?.displayName || user?.email || 'Anton';
  const sendRequest = () => {
    const text = reqText.trim();
    if (!text && reqType !== 'huolto') { toast('Kirjoita mitä agenttien pitää tehdä', 'error'); return; }
    const r: DevRequest = {
      id: newDevRequestId(), createdAt: Date.now(), createdBy: who,
      type: reqType, instructions: (text || 'Tavallinen huoltokierros').slice(0, 4000), status: 'jonossa',
    };
    setRequests(prev => [r, ...(prev || [])].slice(0, DEV_MAX_REQUESTS));
    setReqText('');
    toast('Pyyntö jonossa. Agentit ottavat sen seuraavalla /momentum-jono-ajolla.', 'success');
  };
  const cancelRequest = (id: string) => {
    setRequests(prev => (prev || []).map(r => r.id === id && r.status === 'jonossa' ? { ...r, status: 'peruttu', finishedAt: Date.now() } : r));
  };
  const saveFocus = () => {
    setFocus({ kulma: focusDraft.trim().slice(0, 4000), updatedAt: Date.now(), updatedBy: who });
    setEditFocus(false);
    toast('Painotus tallennettu', 'success');
  };
  const resolveRun = (id: string) => {
    setRuns(prev => (prev || []).map(r => r.id === id ? { ...r, resolved: true, status: r.status === 'paatos' ? 'ok' : r.status } : r));
    toast('Merkitty käsitellyksi', 'success');
  };

  let secNo = 0;
  const num = () => String(++secNo).padStart(2, '0');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Tilarivi */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
        <div style={card}>
          <div style={lbl}>Momentumin terveys</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: healthState.color, flex: 'none' }} />
            <span style={{ ...disp, fontSize: 15 }}>{healthState.text}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            {h.ranAt ? `Tarkistettu ${fmtRelative(h.ranAt, now)}` : 'Huoltokierros lähettää raportin.'}
          </div>
        </div>
        <div style={{ ...card, borderColor: pending.length ? 'var(--pink)' : 'var(--border)' }}>
          <div style={lbl}>Odottaa päätöstäsi</div>
          <div style={{ ...disp, fontSize: 15, marginTop: 6, color: pending.length ? 'var(--pink)' : 'var(--t1)' }}>
            {pending.length ? `${pending.length} ${pending.length === 1 ? 'asia' : 'asiaa'}` : 'Ei mitään'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            {pending.length ? 'Julkaisut, isot päivitykset ja sääntömuutokset odottavat sinua.' : 'Agentit jatkavat omillaan.'}
          </div>
        </div>
        <div style={card}>
          <div style={lbl}>Agentit</div>
          <div style={{ ...disp, fontSize: 15, marginTop: 6, color: live ? 'var(--green)' : 'var(--t1)' }}>
            {live ? 'Työssä nyt' : openReqs.length ? `${openReqs.length} pyyntöä jonossa` : 'Levossa'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            {lastRun ? `Viimeisin: ${DEV_RUN_TYPE_META[lastRun.type]?.label.toLowerCase() || lastRun.type} ${fmtRelative(Date.parse(lastRun.date), now)}` : 'Ei ajoja vielä.'}
          </div>
        </div>
      </div>

      {/* Nyt käynnissä */}
      {live && (
        <section>
          <div className="sec-h">
            <span className="t"><span className="n" style={{ color: 'var(--green)' }}>●</span>Nyt käynnissä</span>
            <span className="meta">{DEV_RUN_TYPE_META[live.type]?.label} · alkoi <b>{fmtClock(Date.parse(live.date))}</b> · <b>{fmtDuration(now - Date.parse(live.date))}</b></span>
          </div>
          <div style={{ ...card, borderColor: 'var(--pri)' }}>
            {live.summary && <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 10 }}>{live.summary}</div>}
            {live.events?.length ? <Events events={live.events} newestFirst /> : <div style={{ fontSize: 13, color: 'var(--t3)' }}>Odottaa ensimmäistä tapahtumaa.</div>}
          </div>
        </section>
      )}

      {/* Päätökset */}
      {pending.length > 0 && (
        <section>
          <div className="sec-h"><span className="t"><span className="n">{num()}</span>Päätökset</span><span className="meta"><b>{pending.length}</b> avoinna</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(r => (
              <div key={r.id} style={{ ...card, borderLeft: '4px solid var(--pink)' }}>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>{fmtDateTime(r.date)} · {DEV_RUN_TYPE_META[r.type]?.label || r.type}</div>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
                  {(r.decisions || []).map((d, i) => <li key={i}>{d}</li>)}
                </ul>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {r.prUrl && <a className="btn btn-secondary btn-sm" href={r.prUrl} target="_blank" rel="noopener noreferrer">Avaa PR</a>}
                  {canEdit && <button className="btn btn-ghost btn-sm" type="button" onClick={() => resolveRun(r.id)}>Merkitse käsitellyksi</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pyydä agenteilta */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Pyydä agenteilta</span>
          <span className="meta">{canEdit ? 'agentit noutavat pyynnön /momentum-jono-ajolla' : 'vain luku'}</span>
        </div>
        <div style={card}>
          <div role="radiogroup" aria-label="Pyynnön tyyppi" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {(Object.keys(DEV_RUN_TYPE_META) as DevRunType[]).map(t => (
              <button key={t} type="button" role="radio" aria-checked={reqType === t}
                className={`btn btn-sm ${reqType === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setReqType(t)}>
                {DEV_RUN_TYPE_META[t].label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 10, lineHeight: 1.5 }}>{DEV_RUN_TYPE_META[reqType].detail}</div>
          <label htmlFor="dev-req-text" style={{ ...lbl, display: 'block', marginBottom: 6 }}>Mitä pitää tehdä</label>
          <textarea id="dev-req-text" className="input" rows={4} value={reqText} disabled={!canEdit}
            onChange={e => setReqText(e.target.value)}
            placeholder={reqType === 'huolto' ? 'Valinnainen: mihin huolto keskittyy' : reqType === 'katselmointi' ? 'Haara tai PR-linkki ja mitä erityisesti katsotaan' : 'Esim. Palaute-sivulla lähetysnappi jää harmaaksi puhelimella. Korjaa ja tarkista myös tabletilla.'}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={!canEdit} onClick={sendRequest}>Lähetä pyyntö</button>
          </div>
        </div>

        {(openReqs.length > 0 || recentReqs.length > 0) && (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...openReqs, ...recentReqs].map(r => (
              <li key={r.id} style={{ ...card, padding: '.75rem 1rem', display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Pill text={REQUEST_STATUS_META[r.status]?.label || r.status} color={REQUEST_STATUS_META[r.status]?.color} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>{r.instructions}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                    {DEV_RUN_TYPE_META[r.type]?.label || r.type} · {r.createdBy || ''} · {fmtRelative(r.createdAt, now)}
                    {r.note ? ` · ${r.note}` : ''}
                  </div>
                </div>
                {r.status === 'jonossa' && canEdit && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelRequest(r.id)}>Peru</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Painotus */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Painotus</span>
          <span className="meta">{focus.updatedAt ? `päivitetty ${fmtRelative(focus.updatedAt, now)}` : 'oletus'}</span>
        </div>
        <div style={card}>
          {editFocus ? (
            <>
              <label htmlFor="dev-focus" style={{ ...lbl, display: 'block', marginBottom: 6 }}>Mitä agentit painottavat, kunnes muutat tätä</label>
              <textarea id="dev-focus" className="input" rows={5} value={focusDraft} onChange={e => setFocusDraft(e.target.value)} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditFocus(false)}>Peru</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={saveFocus}>Tallenna</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--t2)', whiteSpace: 'pre-wrap', flex: 1 }}>{focus.kulma || DEFAULT_DEV_FOCUS.kulma}</div>
              {canEdit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFocusDraft(focus.kulma || DEFAULT_DEV_FOCUS.kulma); setEditFocus(true); }}>Muokkaa</button>}
            </div>
          )}
        </div>
      </section>

      {/* Terveys */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Terveys</span>
          <span className="meta">agentit/bin/terveys.mjs</span>
        </div>
        <HealthCard health={h} now={now} />
      </section>

      {/* Ajot */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Ajot</span>
          <span className="meta"><b>{runs.length}</b> {runs.length === 1 ? 'ajo' : 'ajoa'}{runsLoading ? ' · ladataan' : ''}</span>
        </div>
        {shown.length === 0 ? (
          <div style={{ ...card, fontSize: 13, color: 'var(--t3)', lineHeight: 1.6 }}>
            Ei ajoja vielä. Aja Claude Codessa <code>/momentum-huolto</code> tai <code>/momentum-kehitys</code>, niin ajo ilmestyy tähän.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shown.map(r => {
              const open = openRun === r.id;
              const st = RUN_STATUS_META[r.status] || RUN_STATUS_META.ok;
              return (
                <div key={r.id} style={card}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <Pill text={st.label} color={st.color} />
                    <span style={{ ...disp, fontSize: 13 }}>{DEV_RUN_TYPE_META[r.type]?.label || r.type}</span>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>{fmtDateTime(r.date)}{r.durationMin ? ` · ${r.durationMin} min` : ''}</span>
                    <span style={{ display: 'inline-flex', gap: 3, marginLeft: 'auto' }}>
                      {r.agents.filter(a => DEV_AGENT_BY_ID[a]).map(a => <span key={a} title={DEV_AGENT_BY_ID[a].label}><Glyph id={a} size={20} /></span>)}
                    </span>
                  </div>
                  {r.summary && <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.summary}</div>}
                  <ResultChips results={r.results} />
                  {(r.branch || r.prUrl) && (
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {r.branch && <span>Haara <code>{r.branch}</code></span>}
                      {r.prUrl && <a href={r.prUrl} target="_blank" rel="noopener noreferrer">Pull request</a>}
                    </div>
                  )}
                  {r.events && r.events.length > 0 && (
                    <>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} aria-expanded={open} onClick={() => setOpenRun(open ? null : r.id)}>
                        {open ? 'Piilota tapahtumat' : `Näytä tapahtumat (${r.events.length})`}
                      </button>
                      {open && <div style={{ marginTop: 10 }}><Events events={r.events} /></div>}
                    </>
                  )}
                </div>
              );
            })}
            {runs.length > 15 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(v => !v)}>
                {showAll ? 'Näytä vähemmän' : `Näytä kaikki (${runs.length})`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Tiimi */}
      <section>
        <div className="sec-h">
          <span className="t"><span className="n">{num()}</span>Tiimi</span>
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showTeam} onClick={() => setShowTeam(v => !v)}>
            {showTeam ? 'Piilota' : 'Näytä kuka tekee mitä'}
          </button>
        </div>
        {showTeam && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {DEV_AGENT_DEFS.map(a => (
              <div key={a.id} style={{ ...card, borderTop: `4px solid ${toneVar(a.tone)}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Glyph id={a.id} size={30} />
                  <div>
                    <div style={{ ...disp, fontSize: 13 }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>{a.role} · {a.model}</div>
                  </div>
                </div>
                <div style={{ ...lbl, marginTop: 12 }}>Tekee</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>
                  {a.does.map(d => <li key={d}>{d}</li>)}
                </ul>
                <div style={{ ...lbl, marginTop: 10 }}>Ei koskaan</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>
                  {a.never.map(d => <li key={d}>{d}</li>)}
                </ul>
                {a.file && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 10 }}><code>.claude/agents/{a.file}</code></div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
