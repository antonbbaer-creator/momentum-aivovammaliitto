'use client';

import AppShell from '@/components/AppShell';
import BrainShell from '@/components/brain/BrainShell';
import BrainProposalsSection from '@/components/brain/BrainProposalsSection';

export default function AivotEhdotuksetPage() {
  return (
    <AppShell title="Ehdotukset" subtitle="Agenttien ja kirjausten ehdotukset. Hyväksytty ehdotus menee Kehityssuunnitelmaan tehtäväksi.">
      <BrainShell showTree={false}>
        <BrainProposalsSection />
      </BrainShell>
    </AppShell>
  );
}
