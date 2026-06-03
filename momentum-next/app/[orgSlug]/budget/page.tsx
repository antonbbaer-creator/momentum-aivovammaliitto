'use client';

import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import GrantsSection from '@/components/sections/GrantsSection';

export default function BudgetPage() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const isHetki = orgSlug === 'hetki-company';
  const title = isHetki ? 'Rahoitusvuosikello' : 'Apurahat';
  const subtitle = isHetki
    ? 'Rahoittajat, hakuajat ja vastuut 2026 — kategorioittain'
    : 'Apurahavuosikello — hakuajat, vastuut ja edistyminen 100 000 € tavoitteeseen';

  return (
    <AppShell title={title} subtitle={subtitle}>
      <GrantsSection />
    </AppShell>
  );
}
