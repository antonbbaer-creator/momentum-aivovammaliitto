'use client';

import AppShell from '@/components/AppShell';
import ClientsSection from '@/components/sections/ClientsSection';

export default function AsiakkuudetPage() {
  return (
    <AppShell title="Asiakkuudet" subtitle="Nykyiset, jäissä olevat ja menneet asiakkuudet">
      <ClientsSection />
    </AppShell>
  );
}
