'use client';

import AppShell from '@/components/AppShell';
import AiHetkiProjektiSection from '@/components/sections/AiHetkiProjektiSection';

export default function StudioProjektiPage() {
  return (
    <AppShell title="Projekti" hideTitle>
      <AiHetkiProjektiSection />
    </AppShell>
  );
}
