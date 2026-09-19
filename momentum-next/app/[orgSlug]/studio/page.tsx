'use client';

import AppShell from '@/components/AppShell';
import AiHetkiStudioSection from '@/components/sections/AiHetkiStudioSection';

export default function StudioPage() {
  return (
    <AppShell title="Studio" subtitle="AI-Hetkin tuotantoyhtiö — agentit kehittävät ja kirjoittavat, sinä kommentoit">
      <AiHetkiStudioSection />
    </AppShell>
  );
}
