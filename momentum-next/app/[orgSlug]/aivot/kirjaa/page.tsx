'use client';

import AppShell from '@/components/AppShell';
import BrainShell from '@/components/brain/BrainShell';
import BrainCaptureSection from '@/components/brain/BrainCaptureSection';

export default function AivotKirjaaPage() {
  return (
    <AppShell title="Kirjaa" subtitle="Kirjoita tai sanele. Tekoäly ehdottaa, mihin aivoihin asia kuuluu, ja sinä hyväksyt.">
      <BrainShell showTree={false}>
        <BrainCaptureSection />
      </BrainShell>
    </AppShell>
  );
}
