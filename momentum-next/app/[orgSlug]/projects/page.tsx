'use client';

import AppShell from '@/components/AppShell';
import ProjectsSection from '@/components/sections/ProjectsSection';

export default function ProjectsPage() {
  return (
    <AppShell title="Projektit" subtitle="Kanban + tehtävät">
      <ProjectsSection />
    </AppShell>
  );
}
