'use client';

import AppShell from '@/components/AppShell';
import MediaSection from '@/components/sections/MediaSection';

export default function MediaPage() {
  return (
    <AppShell title="Mediapankki" subtitle="Kuvat, videot ja grafiikat">
      <MediaSection />
    </AppShell>
  );
}
