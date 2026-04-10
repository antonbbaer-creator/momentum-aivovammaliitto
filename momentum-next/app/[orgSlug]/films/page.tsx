'use client';

import AppShell from '@/components/AppShell';
import FilmsSection from '@/components/sections/FilmsSection';

export default function FilmsPage() {
  return (
    <AppShell title="Elokuvat" subtitle="Kuratointi 2026">
      <FilmsSection />
    </AppShell>
  );
}
