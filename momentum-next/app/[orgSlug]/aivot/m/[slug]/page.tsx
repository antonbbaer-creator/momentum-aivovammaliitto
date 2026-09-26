'use client';

import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BrainShell from '@/components/brain/BrainShell';
import BrainNoteSection from '@/components/brain/BrainNoteSection';

export default function AivotNotePage() {
  const raw = (useParams().slug as string) || '';
  const slug = decodeURIComponent(raw);
  return (
    <AppShell title="Aivot" hideTitle>
      <BrainShell activeSlug={slug}>
        <BrainNoteSection slug={slug} />
      </BrainShell>
    </AppShell>
  );
}
