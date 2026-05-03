'use client';

import AppShell from '@/components/AppShell';
import ReflectionSection from '@/components/sections/ReflectionSection';

export default function OmaReflektioPage() {
  return (
    <AppShell title="Reflektio" subtitle="Henkilökohtainen tila" personalMode>
      <ReflectionSection />
    </AppShell>
  );
}
