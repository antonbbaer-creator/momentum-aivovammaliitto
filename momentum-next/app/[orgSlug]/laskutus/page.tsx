'use client';

import AppShell from '@/components/AppShell';
import InvoicingSection from '@/components/sections/InvoicingSection';

export default function LaskutusPage() {
  return (
    <AppShell title="Laskutus" subtitle="Asiakaskohtainen tuotto ja laskujen tila">
      <InvoicingSection />
    </AppShell>
  );
}
