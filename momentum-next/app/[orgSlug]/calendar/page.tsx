'use client';

import AppShell from '@/components/AppShell';
import CalendarSection from '@/components/sections/CalendarSection';

export default function CalendarPage() {
  return (
    <AppShell title="Kalenteri" subtitle="Tapahtumat ja vuosikellon vaiheet">
      <CalendarSection />
    </AppShell>
  );
}
