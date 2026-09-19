'use client';

import AppShell from '@/components/AppShell';
import ScreenwritingSection from '@/components/sections/ScreenwritingSection';

export default function KasikirjoitusPage() {
  return (
    <AppShell title="Käsikirjoitus" subtitle="Viikoittainen kirjoitusajan seuranta" personalMode>
      <ScreenwritingSection />
    </AppShell>
  );
}
