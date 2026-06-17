'use client';

import AppShell from '@/components/AppShell';
import AaniteSection from '@/components/sections/AaniteSection';

export default function AanitePage() {
  return (
    <AppShell title="Äänitteet" subtitle="Lataa oma äänite ja kuuntele se eri nopeuksilla">
      <AaniteSection />
    </AppShell>
  );
}
