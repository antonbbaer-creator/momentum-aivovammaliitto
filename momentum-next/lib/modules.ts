'use client';

import { useOrgData } from './firestore';
import { useParams } from 'next/navigation';

export interface ModuleDef {
  id: string;
  label: string;
  icon: string;
  path: string;
  alwaysOn: boolean;
}

export const MODULE_REGISTRY: Record<string, ModuleDef> = {
  dashboard:  { id: 'dashboard',  label: 'Koti',       icon: '◉', path: '/dashboard',  alwaysOn: true },
  strategy:   { id: 'strategy',   label: 'Strategia',  icon: '◈', path: '/strategy',   alwaysOn: false },
  team:       { id: 'team',       label: 'Tiimi',      icon: '≡', path: '/team',       alwaysOn: false },
  viestit:    { id: 'viestit',    label: 'Viestit',    icon: '◎', path: '/viestit',    alwaysOn: false },
  aikataulut: { id: 'aikataulut', label: 'Aikataulut', icon: '◌', path: '/aikataulut', alwaysOn: false },
  viestinta:  { id: 'viestinta',  label: 'Viestintä',   icon: '▶', path: '/viestinta',  alwaysOn: false },
  ohjelmisto: { id: 'ohjelmisto', label: 'Ohjelmisto', icon: '▷', path: '/ohjelmisto', alwaysOn: false },
  budget:     { id: 'budget',     label: 'Apurahat',   icon: '€', path: '/budget',     alwaysOn: false },
  // Juhla-moduulit (kaytossa juhlatoimikunnassa, saatavilla kaikille)
  vieraat:    { id: 'vieraat',    label: 'Vieraat',    icon: '♥', path: '/vieraat',    alwaysOn: false },
  ruoka:      { id: 'ruoka',      label: 'Ruoka',      icon: '◆', path: '/ruoka',      alwaysOn: false },
  tehtavat:   { id: 'tehtavat',   label: 'Tehtävät',   icon: '☐', path: '/tehtavat',   alwaysOn: false },
  tila:       { id: 'tila',       label: 'Tila',       icon: '⌂', path: '/tila',       alwaysOn: false },
  ohjelma:    { id: 'ohjelma',    label: 'Ohjelma',    icon: '▦', path: '/ohjelma',    alwaysOn: false },
  muistiinpanot: { id: 'muistiinpanot', label: 'Muistiinpanot', icon: '✎', path: '/muistiinpanot', alwaysOn: false },
  palaverit: { id: 'palaverit', label: 'Palaverit', icon: '⊞', path: '/palaverit', alwaysOn: false },
  projects:  { id: 'projects',  label: 'Projektit',  icon: '▣', path: '/projects',  alwaysOn: false },
  palaute:   { id: 'palaute',   label: 'Palaute',    icon: '◆', path: '/palaute',   alwaysOn: false },
};

// Module order in sidebar
export const MODULE_ORDER = ['dashboard', 'strategy', 'team', 'projects', 'viestit', 'aikataulut', 'palaverit', 'viestinta', 'ohjelmisto', 'budget', 'vieraat', 'ruoka', 'tehtavat', 'tila', 'ohjelma', 'muistiinpanot', 'palaute'];

// Default modules for new orgs (viestintaorgit)
export const DEFAULT_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: true,
  team: true,
  viestit: true,
  aikataulut: true,
  viestinta: true,
  ohjelmisto: true,
  budget: true,
  vieraat: false,
  ruoka: false,
  tehtavat: false,
  tila: false,
  ohjelma: false,
  muistiinpanot: false,
  palaverit: false,
  projects: true,
  palaute: true,
};

// AVL:n oletusmoduulit — ei ruokaa eika ohjelmistoa (jatkuva viestintatyo, ei tapahtuma)
export const AVL_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: true,
  team: true,
  viestit: true,
  aikataulut: true,
  viestinta: true,
  ohjelmisto: false,
  budget: true,
  vieraat: false,
  ruoka: false,
  tehtavat: false,
  tila: false,
  ohjelma: false,
  muistiinpanot: true,
  palaverit: false,
  projects: true,
  palaute: true,
};

// Juhlatoimikunnan oletusmoduulit
export const JUHLATOIMIKUNTA_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: false,
  team: true,
  viestit: false,
  aikataulut: true,
  viestinta: false,
  ohjelmisto: false,
  budget: false,
  vieraat: true,
  ruoka: true,
  tehtavat: true,
  tila: true,
  ohjelma: true,
  muistiinpanot: true,
  palaverit: false,
  projects: true,
  palaute: true,
};

// Luuri — puhdas tyhja tyotila kaikilla moduuleilla, irti muista orgeista
export const LUURI_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: true,
  team: true,
  viestit: true,
  aikataulut: true,
  viestinta: true,
  ohjelmisto: true,
  budget: true,
  vieraat: true,
  ruoka: true,
  tehtavat: true,
  tila: true,
  ohjelma: true,
  muistiinpanot: true,
  palaverit: true,
};

export function getDefaultModules(orgSlug: string): Record<string, boolean> {
  if (orgSlug === 'avl') return AVL_MODULES;
  if (orgSlug === 'juhlatoimikunta') return JUHLATOIMIKUNTA_MODULES;
  if (orgSlug === 'luuri') return LUURI_MODULES;
  return DEFAULT_MODULES;
}

export function useModules() {
  const params = useParams();
  const orgSlug = (params?.orgSlug as string) || '';
  const orgDefaults = getDefaultModules(orgSlug);
  const [modules] = useOrgData<Record<string, boolean>>('modules', orgDefaults);

  const isEnabled = (moduleId: string): boolean => {
    const def = MODULE_REGISTRY[moduleId];
    if (def?.alwaysOn) return true;
    return modules[moduleId] ?? orgDefaults[moduleId] ?? false;
  };

  const enabledModules = MODULE_ORDER
    .filter(id => isEnabled(id))
    .map(id => MODULE_REGISTRY[id]);

  return { modules, enabledModules, isEnabled };
}
