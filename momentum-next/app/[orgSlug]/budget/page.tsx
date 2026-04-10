'use client';

import AppShell from '@/components/AppShell';
import GrantsSection from '@/components/sections/GrantsSection';

export default function BudgetPage() {
  return (
    <AppShell title="Apurahat" subtitle="Apurahavuosikello — hakuajat, vastuut ja edistyminen 100 000 € tavoitteeseen">
      <GrantsSection />
    </AppShell>
  );
}
