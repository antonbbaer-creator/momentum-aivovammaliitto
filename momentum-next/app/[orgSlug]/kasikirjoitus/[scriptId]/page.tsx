'use client';

import AppShell from '@/components/AppShell';
import ScreenplayEditorSection from '@/components/sections/ScreenplayEditorSection';

export default function KasikirjoitusEditorPage() {
  return (
    <AppShell title="Käsikirjoitus" hideTitle>
      <ScreenplayEditorSection />
    </AppShell>
  );
}
