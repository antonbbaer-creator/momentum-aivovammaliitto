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
  dashboard:    { id: 'dashboard',    label: 'Koti',          icon: '\u25c9', path: '/dashboard',    alwaysOn: true },
  strategy:     { id: 'strategy',     label: 'Strategia',     icon: '\u25c8', path: '/strategy',     alwaysOn: false },
  projects:     { id: 'projects',     label: 'Projektit',     icon: '\u2630', path: '/projects',     alwaysOn: false },
  publications: { id: 'publications', label: 'Julkaisut',     icon: '\u25b6', path: '/publications', alwaysOn: false },
  calendar:     { id: 'calendar',     label: 'Kalenteri',     icon: '\u25a6', path: '/calendar',     alwaysOn: false },
  channels:     { id: 'channels',     label: 'Kanavat',       icon: '\u25c7', path: '/channels',     alwaysOn: false },
  media:        { id: 'media',        label: 'Mediapankki',   icon: '\u25a3', path: '/media',        alwaysOn: false },
  budget:       { id: 'budget',       label: 'Budjetti',      icon: '\u20ac', path: '/budget',       alwaysOn: false },
  timeline:     { id: 'timeline',     label: 'Aikataulu',     icon: '\u25ac', path: '/timeline',     alwaysOn: false },
  team:         { id: 'team',         label: 'Tiimi',         icon: '\u2261', path: '/team',         alwaysOn: false },
  editor:       { id: 'editor',       label: 'Editori',       icon: '\u25ce', path: '/editor',       alwaysOn: false },
  films:        { id: 'films',        label: 'Elokuvat',      icon: '\u25b7', path: '/films',        alwaysOn: false },
};

// Module order in sidebar
export const MODULE_ORDER = ['dashboard', 'strategy', 'team', 'projects', 'publications', 'calendar', 'channels', 'media', 'editor', 'films', 'budget', 'timeline'];

// Default modules for new orgs (all current ones on, new ones off)
export const DEFAULT_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: true,
  projects: true,
  publications: true,
  calendar: true,
  channels: true,
  media: true,
  budget: false,
  timeline: false,
  team: true,
  editor: true,
  films: true,
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
