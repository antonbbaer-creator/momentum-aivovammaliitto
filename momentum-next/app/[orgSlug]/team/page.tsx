'use client';

import AppShell from '@/components/AppShell';
import TeamSection from '@/components/sections/TeamSection';

export default function TeamPage() {
  return (
    <AppShell title="Tiimi" subtitle="Tiimit, jäsenet ja tiimikohtaiset projektit">
      <TeamSection />
    </AppShell>
  );
}
