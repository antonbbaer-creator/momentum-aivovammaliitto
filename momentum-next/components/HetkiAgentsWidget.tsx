'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import {
  RUNS_KEY, EMPTY_RUNS, RUN_TYPE_META, AGENT_BY_ID, REQUESTS_KEY, EMPTY_REQUESTS, PIPELINE_KEY, EMPTY_PIPELINE,
  activeRuns, runsSince, sumResults, pendingDecisions, fmtRelative, useNow, runningRun, activeAgentOf, fmtDuration, openRequests, callList, stageCounts,
  type AgentRun, type AgentRequest, type PipelineMirror,
} from '@/lib/agents-shared';

// Etusivun pikanäkymä Hetki Companylle: mitä asiakashankinta-agentit tekivät viimeksi,
// odottaako jokin Antonin päätöstä ja milloin seuraava ajo on.
// Näytetään vain jos org === 'hetki-company'.
export default function HetkiAgentsWidget() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const [rawRuns] = useOrgData<AgentRun[]>(RUNS_KEY, EMPTY_RUNS);
  const [rawRequests] = useOrgData<AgentRequest[]>(REQUESTS_KEY, EMPTY_REQUESTS);
  const [pipeline] = useOrgData<PipelineMirror>(PIPELINE_KEY, EMPTY_PIPELINE);
  const runs = useMemo(() => activeRuns(rawRuns || []), [rawRuns]);
  const anyRunning = useMemo(() => (rawRuns || []).some(r => r.status === 'kesken' && !r.deletedAt), [rawRuns]);
  const now = useNow(anyRunning ? 1000 : 60000);
  const live = runningRun(runs, now);
  const activeAgent = activeAgentOf(live);
  const last = runs[0];
  const pending = useMemo(() => pendingDecisions(runs), [runs]);
  const sums7 = useMemo(() => sumResults(runsSince(runs, 7, now)), [runs, now]);
  const open = useMemo(() => openRequests(rawRequests || []), [rawRequests]);
  const calls = useMemo(() => callList(pipeline || EMPTY_PIPELINE, now), [pipeline, now]);
  const counts = useMemo(() => stageCounts(pipeline || EMPTY_PIPELINE), [pipeline]);

  if (orgSlug !== 'hetki-company') return null;

  const silentHours = last ? (now - Date.parse(last.date)) / 3600000 : Infinity;
  const dot = live ? 'var(--green)' : !last ? 'var(--t3)' : silentHours > 3 ? 'var(--yellow)' : 'var(--green)';
  const lastEvent = live?.events && live.events.length ? live.events[live.events.length - 1] : undefined;

  return (
    <Link href={`/${orgSlug}/agentit`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div style={{
        background: 'var(--card)', border: `1px solid ${pending.length ? 'var(--pink)' : 'var(--border)'}`,
        borderRadius: 'var(--rl)', padding: '1rem 1.25rem', cursor: 'pointer', transition: 'border-color .15s',
      }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = pending.length ? 'var(--pink)' : 'var(--border)')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.5rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden className={live ? 'ag-live' : undefined} style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
            Asiakashankinta-agentit
          </div>
          <span style={{ fontSize: '.66rem', color: 'var(--t3)' }}>Avaa agentit →</span>
        </div>

        {live && (
          <div style={{ fontSize: '.85rem', lineHeight: 1.5, marginBottom: '.4rem' }}>
            <b style={{ fontWeight: 600, color: 'var(--green)' }}>{RUN_TYPE_META[live.type].label} käynnissä</b>
            <span style={{ color: 'var(--t3)' }}> {fmtDuration(now - Date.parse(live.date))}</span>
            {lastEvent && <span className="ag-fade" key={lastEvent.t}>{' · '}{activeAgent ? AGENT_BY_ID[activeAgent].label : ''} {lastEvent.text}</span>}
          </div>
        )}

        {pending.length > 0 && (
          <div style={{ fontSize: '.85rem', color: 'var(--pink)', fontWeight: 600, marginBottom: '.4rem' }}>
            {pending.length} {pending.length === 1 ? 'asia odottaa' : 'asiaa odottaa'} päätöstäsi
          </div>
        )}

        {last ? (
          <div style={{ fontSize: '.85rem', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--t3)' }}>{RUN_TYPE_META[last.type].label} {fmtRelative(Date.parse(last.date), now)}, {last.agents.map(a => AGENT_BY_ID[a].label.toLowerCase()).join(', ')}.</span>{' '}
            {last.summary.length > 140 ? last.summary.slice(0, 138) + '…' : last.summary}
          </div>
        ) : (
          <div style={{ fontSize: '.82rem', color: 'var(--t3)' }}>Ei ajoja vielä. Kun Mac mini ajaa, viimeisin kierros näkyy tässä.</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.6rem', fontSize: '.72rem', color: 'var(--t3)', flexWrap: 'wrap', gap: '.5rem' }}>
          <span>7 pv: <b style={{ color: 'var(--t2)' }}>{sums7.luonnokset}</b> luonnosta, <b style={{ color: 'var(--t2)' }}>{sums7.vastaukset}</b> vastausta, <b style={{ color: 'var(--t2)' }}>{sums7.uudetProspektit + sums7.tutkitut}</b> prospektia</span>
          <span>{open.length ? `${open.length} pyyntöä odottaa` : 'Ei pyyntöjä jonossa'} · soita tänään <b style={{ color: calls.length ? 'var(--red)' : 'var(--t2)' }}>{calls.length}</b> · lähetetty <b style={{ color: 'var(--t2)' }}>{counts.lahetetty}</b>, luonnoksia <b style={{ color: 'var(--t2)' }}>{counts.luonnos}</b></span>
        </div>
      </div>
    </Link>
  );
}
