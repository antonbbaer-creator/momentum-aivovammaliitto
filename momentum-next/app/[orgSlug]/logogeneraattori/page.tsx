'use client';

import dynamic from 'next/dynamic';
import AppShell from '@/components/AppShell';

const LogoGeneratorSection = dynamic(() => import('@/components/sections/LogoGeneratorSection'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
      <div className="typing"><span /><span /><span /></div>
    </div>
  ),
});

export default function LogoGeneratorPage() {
  return (
    <AppShell title="Logogeneraattori" subtitle="Yhdistyksen logo kahdella sommittelulla ja kolmessa koossa">
      <LogoGeneratorSection />
    </AppShell>
  );
}
