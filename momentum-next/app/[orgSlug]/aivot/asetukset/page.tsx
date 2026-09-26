'use client';

import AppShell from '@/components/AppShell';
import BrainShell from '@/components/brain/BrainShell';
import BrainSettingsSection from '@/components/brain/BrainSettingsSection';

export default function AivotAsetuksetPage() {
  return (
    <AppShell title="Aivojen asetukset" subtitle="Agenttitokenit, vienti, päätösloki ja muutoshistoria">
      <BrainShell showTree={false}>
        <BrainSettingsSection />
      </BrainShell>
    </AppShell>
  );
}
