'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import TabSwitcher from '@/components/TabSwitcher';
import FilmsSection from '@/components/sections/FilmsSection';
import MusicSection from '@/components/sections/MusicSection';
import WorkshopsSection from '@/components/sections/WorkshopsSection';
import ProgrammeGridSection from '@/components/sections/ProgrammeGridSection';

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
