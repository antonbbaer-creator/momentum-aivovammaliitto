'use client';

import AppShell from '@/components/AppShell';
import ChannelsSection from '@/components/sections/ChannelsSection';

export default function ChannelsPage() {
  return (
    <AppShell title="Kanavat" subtitle="Viestintäkanavat ja tilastot">
      <ChannelsSection />
    </AppShell>
  );
}
