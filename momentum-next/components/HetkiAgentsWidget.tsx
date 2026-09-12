'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import {
  RUNS_KEY, EMPTY_RUNS, RUN_TYPE_META, AGENT_BY_ID,
  activeRuns, runsSince, sumResults, pendingDecisions, nextScheduledRuns, fmtRelative, fmtDateTime, useNow,
  type AgentRun,
} from '@/lib/agents-shared';

// Etusivun pikanäkymä Hetki Companylle: mitä asiakashankinta-agentit tekivät viimeksi,
// odottaako jokin Antonin päätöstä ja milloin seuraava ajo on.
// Näytetään vain jos org === 'hetki-company'.
export default function HetkiAgentsWidget() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const [rawRuns] = useOrgData<AgentRun[]>(RUNS_KEY, EMPTY_RUNS);
  const runs = useMemo(() => activeRuns(rawRuns || []), [rawRuns]);
  const now = useNow();
  const last = runs[0];
  const pending = useMemo(() => pendingDecisions(runs), [runs]);
  const sums7 = useMemo(() => sumResults(runsSince(runs, 7, now)), [runs, now]);
  const next = nextScheduledRuns(new Date(now))[0];

  if (orgSlug !== 'hetki-company') return null;

  const silentHours = last ? (now - Date.parse(last.date)) / 3600000 : Infinity;
  const dot = !last ? 'var(--t3)' : silentHours > 3 ? 'var(--yellow)' : 'var(--green)';

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
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
            Asiakashankinta-agentit
          </div>
          <span style={{ fontSize: '.66rem', color: 'var(--t3)' }}>Avaa agentit →</span>
        </div>

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
          <span>Seuraava: {RUN_TYPE_META[next.type].label.toLowerCase()} {fmtDateTime(next.at.toISOString())}</span>
        </div>
      </div>
    </Link>
  );
}
