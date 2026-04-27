'use client';

import AppShell from '@/components/AppShell';
import PersonalWeekSection from '@/components/sections/PersonalWeekSection';

export default function OmaViikkoPage() {
  return (
    <AppShell title="Viikko" subtitle="Henkilökohtainen tila" personalMode>
      <PersonalWeekSection />
    </AppShell>
  );
}
