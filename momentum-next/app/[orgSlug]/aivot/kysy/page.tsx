'use client';

import AppShell from '@/components/AppShell';
import BrainShell from '@/components/brain/BrainShell';
import BrainAskSection from '@/components/brain/BrainAskSection';

export default function AivotKysyPage() {
  return (
    <AppShell title="Kysy" subtitle="Kysy aivoilta. Vastaus perustuu vain aivojen sisältöön ja kertoo lähteet.">
      <BrainShell showTree={false}>
        <BrainAskSection />
      </BrainShell>
    </AppShell>
  );
}
