'use client';

import AppShell from '@/components/AppShell';
import RoutinesSection from '@/components/sections/RoutinesSection';

export default function RutiinitPage() {
  return (
    <AppShell title="Rutiinit" subtitle="Aloita, ylläpidä, lopeta" personalMode>
      <RoutinesSection />
    </AppShell>
  );
}
