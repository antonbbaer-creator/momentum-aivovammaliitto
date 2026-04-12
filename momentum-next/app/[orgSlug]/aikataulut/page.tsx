'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import TabSwitcher from '@/components/TabSwitcher';
import YearwheelSection from '@/components/sections/YearwheelSection';
import CalendarSection from '@/components/sections/CalendarSection';
import PhaseTimelineSection from '@/components/sections/PhaseTimelineSection';
import MonthTimelineSection from '@/components/sections/MonthTimelineSection';
import { useParams } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { YearPhase } from '@/lib/yearwheel-shared';
import { getOrgYearwheel } from '@/lib/org-defaults';

type Tab = 'wheel' | 'calendar' | 'timeline';

interface CalEvent { id: number; t: string; ch: string; date: string; st: string; }

export default function AikataulutPage() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const isMonthScale = orgSlug === 'juhlatoimikunta';
  const [tab, setTab] = useState<Tab>(isMonthScale ? 'timeline' : 'wheel');

  const [phases, setPhases] = useOrgData<YearPhase[]>('yearwheel', getOrgYearwheel(orgSlug));
  const [events, setEvents] = useOrgData<CalEvent[]>('events', []);

  const subtitle = `${phases.length} vaihetta · ${events.length} tapahtumaa`;

  // Juhlatoimikunta: viikkopohjainen aikajana + kalenteri (ei vuosikelloa)
  if (isMonthScale) {
    return (
      <AppShell title="Aikataulut" subtitle={subtitle}>
        <TabSwitcher
          tabs={[
            { id: 'timeline', label: 'Aikajana',  icon: '▬', count: phases.length },
            { id: 'calendar', label: 'Kalenteri', icon: '▦', count: events.length },
          ]}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
        />
        {tab === 'timeline' && <MonthTimelineSection phases={phases} setPhases={setPhases} />}
        {tab === 'calendar' && <CalendarSection phases={phases} setPhases={setPhases} events={events} setEvents={setEvents} />}
      </AppShell>
    );
  }

  return (
    <AppShell title="Aikataulut" subtitle={subtitle}>
      <TabSwitcher
        tabs={[
          { id: 'wheel',    label: 'Vuosikello', icon: '◌', count: phases.length },
          { id: 'calendar', label: 'Kalenteri',  icon: '▦', count: events.length },
          { id: 'timeline', label: 'Aikajana',   icon: '▬' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'wheel'    && <YearwheelSection phases={phases} setPhases={setPhases} />}
      {tab === 'calendar' && <CalendarSection phases={phases} setPhases={setPhases} events={events} setEvents={setEvents} />}
      {tab === 'timeline' && <PhaseTimelineSection phases={phases} setPhases={setPhases} />}
    </AppShell>
  );
}
