'use client';

import AppShell from '@/components/AppShell';
import AgentsSection from '@/components/sections/AgentsSection';

export default function AgentitPage() {
  return (
    <AppShell title="Agentit" subtitle="Asiakashankinnan agentit Mac minillä: miten ne toimivat ja mitä ne saavat aikaan">
      <AgentsSection />
    </AppShell>
  );
}
