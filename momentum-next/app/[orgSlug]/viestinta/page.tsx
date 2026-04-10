'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import TabSwitcher from '@/components/TabSwitcher';
import MediaSection from '@/components/sections/MediaSection';
import PublicationsSection from '@/components/sections/PublicationsSection';
import ChannelsSection from '@/components/sections/ChannelsSection';
import ProjectsSection from '@/components/sections/ProjectsSection';
import EditorSection from '@/components/sections/EditorSection';

type Tab = 'media' | 'publications' | 'channels' | 'projects' | 'editor';

export default function ViestintaPage() {
  const [tab, setTab] = useState<Tab>('publications');

  return (
    <AppShell title="Viestintä" subtitle="Julkaisut · Mediapankki · Kanavat · Projektit · Editori">
      <TabSwitcher
        tabs={[
          { id: 'publications', label: 'Julkaisut',    icon: '▶' },
          { id: 'media',        label: 'Mediapankki',  icon: '▣' },
          { id: 'channels',     label: 'Kanavat',      icon: '◇' },
          { id: 'projects',     label: 'Projektit',    icon: '☰' },
          { id: 'editor',       label: 'Editori',      icon: '◎' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'publications' && <PublicationsSection />}
      {tab === 'media'        && <MediaSection />}
      {tab === 'channels'     && <ChannelsSection />}
      {tab === 'projects'     && <ProjectsSection />}
      {tab === 'editor'       && <EditorSection />}
    </AppShell>
  );
}
