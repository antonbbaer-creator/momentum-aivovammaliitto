'use client';

import AppShell from '@/components/AppShell';
import NotebooksSection from '@/components/sections/NotebooksSection';

export default function OmaMuistiinpanotPage() {
  return (
    <AppShell title="Muistiinpanot" subtitle="Henkilökohtainen tila" personalMode>
      <NotebooksSection />
    </AppShell>
  );
}
