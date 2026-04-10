'use client';

import AppShell from '@/components/AppShell';
import PublicationsSection from '@/components/sections/PublicationsSection';

export default function PublicationsPage() {
  return (
    <AppShell title="Julkaisut" subtitle="Viestintäjulkaisut ja kanavajako">
      <PublicationsSection />
    </AppShell>
  );
}
