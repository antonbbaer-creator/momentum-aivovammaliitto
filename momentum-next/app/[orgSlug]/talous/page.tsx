'use client';

import AppShell from '@/components/AppShell';
import HetkiBudgetSection from '@/components/sections/HetkiBudgetSection';

export default function TalousPage() {
  return (
    <AppShell title="Budjetti" subtitle="Tulot, menot ja vuositulos-ennuste">
      <HetkiBudgetSection />
    </AppShell>
  );
}
