'use client';

import AppShell from '@/components/AppShell';
import BrainShell from '@/components/brain/BrainShell';
import BrainHomeSection from '@/components/brain/BrainHomeSection';

export default function AivotPage() {
  return (
    <AppShell title="Aivot" subtitle="Organisaation koko tietopohja: tavoitteet, toimintatavat, asiakkaat, projektit ja päätökset">
      <BrainShell showTree={false}>
        <BrainHomeSection />
      </BrainShell>
    </AppShell>
  );
}
