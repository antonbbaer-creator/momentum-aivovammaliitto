'use client';

import AppShell from '@/components/AppShell';
import BrainShell from '@/components/brain/BrainShell';
import BrainNewNoteSection from '@/components/brain/BrainNewNoteSection';

export default function AivotNewNotePage() {
  return (
    <AppShell title="Uusi muistiinpano" subtitle="Aloita pohjasta tai tyhjästä">
      <BrainShell>
        <BrainNewNoteSection />
      </BrainShell>
    </AppShell>
  );
}
