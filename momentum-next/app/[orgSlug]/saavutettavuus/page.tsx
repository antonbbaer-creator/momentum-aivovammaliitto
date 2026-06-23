'use client';

import AppShell from '@/components/AppShell';
import PdfAccessibilitySection from '@/components/sections/PdfAccessibilitySection';

export default function SaavutettavuusPage() {
  return (
    <AppShell
      title="Esitteet"
      subtitle="Esitearkisto ja saavutettavuus — tee verkkoon julkaistavasta PDF-esitteestä saavutettava (WCAG 2.1 AA / PDF/UA)"
    >
      <PdfAccessibilitySection />
    </AppShell>
  );
}
