'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import AppShell from '@/components/AppShell';
import TabSwitcher from '@/components/TabSwitcher';

const SectionLoader = () => (
  <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
    <div className="typing"><span /><span /><span /></div>
  </div>
);

const ProgrammeGridSection = dynamic(() => import('@/components/sections/ProgrammeGridSection'), { loading: SectionLoader });
const FilmsSection = dynamic(() => import('@/components/sections/FilmsSection'), { loading: SectionLoader });
const MusicSection = dynamic(() => import('@/components/sections/MusicSection'), { loading: SectionLoader });
const WorkshopsSection = dynamic(() => import('@/components/sections/WorkshopsSection'), { loading: SectionLoader });

type Tab = 'schedule' | 'films' | 'music' | 'workshops';

export default function OhjelmistoPage() {
  const [tab, setTab] = useState<Tab>('schedule');

  return (
    <AppShell title="Ohjelmisto" subtitle="Festivaaliviikko 20.–26.8.2026 · Elokuvat, musiikki, työpajat">
      <TabSwitcher
        tabs={[
          { id: 'schedule',  label: 'Kokonaisaikataulut', icon: '▦' },
          { id: 'films',     label: 'Elokuvat',           icon: '▷' },
          { id: 'music',     label: 'Musiikki',           icon: '♫' },
          { id: 'workshops', label: 'Työpajat',           icon: '▣' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'schedule'  && <ProgrammeGridSection />}
      {tab === 'films'     && <FilmsSection />}
      {tab === 'music'     && <MusicSection />}
      {tab === 'workshops' && <WorkshopsSection />}
    </AppShell>
  );
}
