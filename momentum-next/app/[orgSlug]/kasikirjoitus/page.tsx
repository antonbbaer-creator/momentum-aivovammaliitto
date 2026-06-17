'use client';

import AppShell from '@/components/AppShell';
import ScreenplayListSection from '@/components/sections/ScreenplayListSection';

export default function KasikirjoitusPage() {
  return (
    <AppShell title="Käsikirjoitukset" subtitle="Hetki Film Companyn käsikirjoitukset — luonnokset, versiot ja vienti">
      <ScreenplayListSection />
    </AppShell>
  );
}
