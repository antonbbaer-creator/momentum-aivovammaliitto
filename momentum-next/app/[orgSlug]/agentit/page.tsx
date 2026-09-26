'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import TabSwitcher from '@/components/TabSwitcher';
import AgentsSection from '@/components/sections/AgentsSection';
import MomentumDevSection from '@/components/sections/MomentumDevSection';

type Tab = 'myynti' | 'kehitys';

const SUBTITLES: Record<Tab, string> = {
  myynti: 'Asiakashankinnan agentit Mac minillä: miten ne toimivat ja mitä ne saavat aikaan',
  kehitys: 'Momentumin omat agentit: ylläpito, tietoturva, saavutettavuus ja kehitys palautteiden pohjalta',
};

export default function AgentitPage() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const [tab, setTab] = useState<Tab>('myynti');
  const isHetki = orgSlug === 'hetki-company';

  return (
    <AppShell title="Agentit" subtitle={SUBTITLES[tab]}>
      {isHetki && (
        <TabSwitcher
          active={tab}
          onChange={id => setTab(id as Tab)}
          tabs={[{ id: 'myynti', label: 'Asiakashankinta' }, { id: 'kehitys', label: 'Momentum-kehitys' }]}
        />
      )}
      {isHetki && tab === 'kehitys' ? <MomentumDevSection /> : <AgentsSection />}
    </AppShell>
  );
}
