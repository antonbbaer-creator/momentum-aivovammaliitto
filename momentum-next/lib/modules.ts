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
  budjetti:   { id: 'budjetti',   label: 'Budjetti',   icon: '€', path: '/budjetti',   alwaysOn: false },
  // Juhla-moduulit (kaytossa juhlatoimikunnassa, saatavilla kaikille)
  vieraat:    { id: 'vieraat',    label: 'Vieraat',    icon: '♥', path: '/vieraat',    alwaysOn: false },
  ruoka:      { id: 'ruoka',      label: 'Ruoka',      icon: '◆', path: '/ruoka',      alwaysOn: false },
  tehtavat:   { id: 'tehtavat',   label: 'Tehtävät',   icon: '☐', path: '/tehtavat',   alwaysOn: false },
  tila:       { id: 'tila',       label: 'Tila',       icon: '⌂', path: '/tila',       alwaysOn: false },
  ohjelma:    { id: 'ohjelma',    label: 'Ohjelma',    icon: '▦', path: '/ohjelma',    alwaysOn: false },
  muistiinpanot: { id: 'muistiinpanot', label: 'Kokoukset', icon: '✎', path: '/muistiinpanot', alwaysOn: false },
  muistiinpanotProjekti: { id: 'muistiinpanotProjekti', label: 'Luomistila', icon: '✎', path: '/muistiinpanot-projekti', alwaysOn: false },
  palaverit: { id: 'palaverit', label: 'Palaverit', icon: '⊞', path: '/palaverit', alwaysOn: false },
  projects:  { id: 'projects',  label: 'Projektit',  icon: '▣', path: '/projects',  alwaysOn: false },
  asiakkuudet: { id: 'asiakkuudet', label: 'Asiakkuudet', icon: '◆', path: '/asiakkuudet', alwaysOn: false },
  laskutus:  { id: 'laskutus',  label: 'Laskutus',   icon: '€', path: '/laskutus',  alwaysOn: false },
  talous:    { id: 'talous',    label: 'Budjetti',   icon: '◇', path: '/talous',    alwaysOn: false },
  tyonjako:  { id: 'tyonjako',  label: 'Työnjako',   icon: '≈', path: '/tyonjako',  alwaysOn: false },
  palaute:   { id: 'palaute',   label: 'Palaute',    icon: '◆', path: '/palaute',   alwaysOn: false },
  ohjeet:    { id: 'ohjeet',    label: 'Ohjeet',     icon: '?', path: '/ohjeet',    alwaysOn: false },
  logogeneraattori: { id: 'logogeneraattori', label: 'Logogeneraattori', icon: '✦', path: '/logogeneraattori', alwaysOn: false },
  graafinen: { id: 'graafinen', label: 'Graafinen ohjeisto', icon: '◐', path: '/graafinen', alwaysOn: false },
};

// Module order in sidebar
export const MODULE_ORDER = ['dashboard', 'strategy', 'team', 'tyonjako', 'projects', 'asiakkuudet', 'laskutus', 'talous', 'viestit', 'aikataulut', 'palaverit', 'viestinta', 'graafinen', 'logogeneraattori', 'ohjelmisto', 'budget', 'budjetti', 'vieraat', 'ruoka', 'tehtavat', 'tila', 'ohjelma', 'muistiinpanot', 'muistiinpanotProjekti', 'ohjeet', 'palaute'];

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
  budjetti: false,
  vieraat: false,
  ruoka: false,
  tehtavat: false,
  tila: false,
  ohjelma: false,
  muistiinpanot: false,
  muistiinpanotProjekti: true,
  ohjeet: false,
  palaverit: false,
  projects: true,
  tyonjako: true,
  palaute: true,
  graafinen: false,
};

// AVL:n oletusmoduulit — ei ruokaa eika ohjelmistoa (jatkuva viestintatyo, ei tapahtuma).
// Logogeneraattori on AVL-spesifinen tyokalu jasenyhdistysten logojen tuottamiseen.
export const AVL_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: true,
  team: true,
  viestit: true,
  aikataulut: true,
  viestinta: true,
  logogeneraattori: true,
  ohjelmisto: false,
  budget: true,
  vieraat: false,
  ruoka: false,
  tehtavat: false,
  tila: false,
  ohjelma: false,
  muistiinpanot: true,
  muistiinpanotProjekti: true,
  ohjeet: false,
  palaverit: false,
  projects: true,
  tyonjako: true,
  palaute: true,
  graafinen: true,
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
  muistiinpanotProjekti: true,
  ohjeet: false,
  palaverit: false,
  projects: true,
  tyonjako: true,
  palaute: true,
  graafinen: false,
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
  muistiinpanotProjekti: true,
  ohjeet: true,
  palaverit: true,
  projects: true,
  tyonjako: true,
  graafinen: true,
};

// Hetki Company — viestintätoimisto.
// Asiakkuuksien ja yrityksen sisäisten töiden hallinta.
// Projects-moduuli on keskeinen: kukin asiakkuus on yksi projekti (clientName-tagilla).
export const HETKI_COMPANY_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: true,
  team: true,
  viestit: true,
  aikataulut: true,
  viestinta: true,
  ohjelmisto: false,
  budget: true,           // Rahoitusvuosikello — tuotantoyhtiön rahoittajarekisteri (apurahat)
  budjetti: false,        // vanha (Ihaa-tyylinen) pois — Hetki kayttaa 'talous'
  talous: true,           // Hetki-spesifinen tulot/menot/tulos-budjetti
  vieraat: false,
  ruoka: false,
  tehtavat: true,
  tila: false,
  ohjelma: false,
  muistiinpanot: true,
  muistiinpanotProjekti: true,
  ohjeet: true,
  palaverit: true,
  projects: true,
  asiakkuudet: true,
  laskutus: true,
  tyonjako: true,
  palaute: true,
  logogeneraattori: false,
  graafinen: true,
};

// Ihaa — venekunnostus, pieni tiimi, harrastusprojekti.
// HUOM: budjetti (ei apurahat) — jaetut kulut split-laskelmalla.
// Projects-moduuli pois: koko työtila on yksi projekti, tehtävälista riittää.
export const IHAA_MODULES: Record<string, boolean> = {
  dashboard: true,
  strategy: false,
  team: true,
  viestit: false,
  aikataulut: true,
  viestinta: false,
  ohjelmisto: false,
  budget: false,
  budjetti: true,
  vieraat: false,
  ruoka: false,
  tehtavat: true,
  tila: false,
  ohjelma: false,
  muistiinpanot: true,
  muistiinpanotProjekti: true,
  ohjeet: true,
  palaverit: true,
  projects: false,
  tyonjako: true,
  palaute: true,
  graafinen: false,
};

// Loistosetlementti ry — jarjestotoiminta, sama profiili kuin AVL:lla.
export const LOISTOSETLEMENTTI_MODULES: Record<string, boolean> = AVL_MODULES;

export function getDefaultModules(orgSlug: string): Record<string, boolean> {
  if (orgSlug === 'avl') return AVL_MODULES;
  if (orgSlug === 'juhlatoimikunta') return JUHLATOIMIKUNTA_MODULES;
  if (orgSlug === 'luuri') return LUURI_MODULES;
  if (orgSlug === 'ihaa') return IHAA_MODULES;
  if (orgSlug === 'hetki-company') return HETKI_COMPANY_MODULES;
  if (orgSlug === 'loistosetlementti') return LOISTOSETLEMENTTI_MODULES;
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
