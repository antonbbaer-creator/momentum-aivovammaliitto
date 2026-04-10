'use client';

import AppShell from '@/components/AppShell';
import EditorSection from '@/components/sections/EditorSection';

export default function EditorPage() {
  return (
    <AppShell title="Editori" subtitle="Logot ja postaukset">
      <EditorSection />
    </AppShell>
  );
}
