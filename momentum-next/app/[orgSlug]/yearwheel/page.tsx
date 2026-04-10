'use client';

import AppShell from '@/components/AppShell';
import YearwheelSection from '@/components/sections/YearwheelSection';

export default function YearwheelPage() {
  return (
    <AppShell title="Vuosikello" subtitle="Festivaalivuoden vaiheet kategorioittain">
      <YearwheelSection />
    </AppShell>
  );
}
