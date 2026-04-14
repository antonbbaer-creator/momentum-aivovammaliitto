'use client';

import AppShell from '@/components/AppShell';
import MeetingsSection from '@/components/sections/MeetingsSection';

export default function PalaveritPage() {
  return (
    <AppShell title="Palaverit" subtitle="Kokoukset, palaverit ja ajanvaraukset">
      <MeetingsSection />
    </AppShell>
  );
}
