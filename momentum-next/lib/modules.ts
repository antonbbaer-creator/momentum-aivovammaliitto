'use client';

import { useOrgData } from './firestore';

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
  viestinta:  { id: 'viestinta',  label: 'Viestintä',  icon: '▶', path: '/viestinta',  alwaysOn: false },
  ohjelmisto: { id: 'ohjelmisto', label: 'Ohjelmisto', icon: '▷', path: '/ohjelmisto', alwaysOn: false },
  budget:     { id: 'budget',     label: 'Apurahat',   icon: '€', path: '/budget',     alwaysOn: false },
};

// Module order in sidebar
export const MODULE_ORDER = ['dashboard', 'strategy', 'team', 'viestit', 'aikataulut', 'viestinta', 'ohjelmisto', 'budget'];

// Default modules for new orgs
export const DEFAULT_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: true,
  team: true,
  viestit: true,   // Sisäinen chat — tiimikanavat + DMit
  aikataulut: true,
  viestinta: true,
  ohjelmisto: true,
  budget: true,  // Apurahat — aktiivinen LLFF:lle, tärkein 100k tavoitteen seurantaan
};

export function useModules() {
  const [modules] = useOrgData<Record<string, boolean>>('modules', DEFAULT_MODULES);

  const isEnabled = (moduleId: string): boolean => {
    const def = MODULE_REGISTRY[moduleId];
    if (def?.alwaysOn) return true;
    return modules[moduleId] ?? DEFAULT_MODULES[moduleId] ?? false;
  };

  const enabledModules = MODULE_ORDER
    .filter(id => isEnabled(id))
    .map(id => MODULE_REGISTRY[id]);

  return { modules, enabledModules, isEnabled };
}
