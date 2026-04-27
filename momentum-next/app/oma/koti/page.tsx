'use client';

import AppShell from '@/components/AppShell';
import PersonalHomeSection from '@/components/sections/PersonalHomeSection';
import { useAuth } from '@/lib/auth';

export default function KotiPage() {
  const { user } = useAuth();
  const firstName = (user?.displayName || '').split(' ')[0] || 'sinä';
  return (
    <AppShell title={`Hei, ${firstName}.`} subtitle="Henkilökohtainen tila" personalMode>
      <PersonalHomeSection />
    </AppShell>
  );
}
