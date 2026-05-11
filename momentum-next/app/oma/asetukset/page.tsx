'use client';

import AppShell from '@/components/AppShell';
import PersonalCategoriesSection from '@/components/sections/PersonalCategoriesSection';
import PersonalIntegrationsSection from '@/components/sections/PersonalIntegrationsSection';
import PersonalOrgVisibilitySection from '@/components/sections/PersonalOrgVisibilitySection';

export default function OmaAsetuksetPage() {
  return (
    <AppShell title="Asetukset" subtitle="Henkilökohtainen tila" personalMode>
      <PersonalOrgVisibilitySection />
      <PersonalCategoriesSection />
      <PersonalIntegrationsSection />
    </AppShell>
  );
}
