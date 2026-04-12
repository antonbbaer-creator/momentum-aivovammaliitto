// Keskitetty org-kohtainen oletusrekisteri
// Palauttaa oikeat oletusarvot kullekin organisaatiolle.
// LLFF saa nykyiset oletukset, AVL saa omat/tyhjät.
//
// TÄRKEÄ: Kaikki palautusarvot ovat moduulitason vakioita (stabiilit referenssit).
// Uuden objektin luominen funktiokutsun sisällä aiheuttaa äärettömän re-render-loopin
// kun arvo käytetään useOrgData():n default-parametrina.

import type { OrgTeam, OrgTeamMember } from './team-shared';
import { DEFAULT_LLFF_TEAMS, DEFAULT_LLFF_TEAM_MEMBERS } from './team-shared';
import type { Grant, GrantsSettings } from './grants-shared';
import { LLFF_GRANTS_DEFAULT, DEFAULT_GRANTS_SETTINGS } from './grants-shared';
import type { CommsPlan } from './comms-plan-shared';
import { DEFAULT_LLFF_2026_PLAN } from './comms-plan-shared';
import type { YearPhase } from './yearwheel-shared';
import { defaultLlffYearwheel } from './yearwheel-shared';
import {
  DEFAULT_AVL_TEAMS,
  DEFAULT_AVL_TEAM_MEMBERS,
  DEFAULT_AVL_COMMS_PLAN,
  DEFAULT_AVL_YEARWHEEL,
} from './avl-defaults';
import {
  DEFAULT_JUHLATOIMIKUNTA_TEAMS,
  DEFAULT_JUHLATOIMIKUNTA_TEAM_MEMBERS,
  DEFAULT_JUHLATOIMIKUNTA_COMMS_PLAN,
  DEFAULT_JUHLATOIMIKUNTA_YEARWHEEL,
} from './juhlatoimikunta-defaults';

// ── Stabiilit fallback-vakiot (ei luoda uusia objekteja funktiokutsussa) ──

const EMPTY_TEAMS: OrgTeam[] = [];
const EMPTY_MEMBERS: OrgTeamMember[] = [];
const EMPTY_GRANTS: Grant[] = [];
const EMPTY_GRANTS_SETTINGS: GrantsSettings = { yearTargets: {}, defaultYear: 2026 };
const EMPTY_YEARWHEEL: YearPhase[] = [];
const DEFAULT_CHANNELS: string[] = ['Instagram', 'Facebook', 'LinkedIn', 'Nettisivut'];

// ── Firestore-avaimet ──────────────────────────────────────────

export function getGrantsKey(orgSlug: string): string {
  return orgSlug === 'llff' ? 'llff_grants' : 'grants';
}

export function getGrantsSettingsKey(orgSlug: string): string {
  return orgSlug === 'llff' ? 'llff_grants_settings' : 'grants_settings';
}

// ── Tiimit ─────────────────────────────────────────────────────

export function getOrgTeams(orgSlug: string): OrgTeam[] {
  if (orgSlug === 'llff') return DEFAULT_LLFF_TEAMS;
  if (orgSlug === 'avl') return DEFAULT_AVL_TEAMS;
  if (orgSlug === 'juhlatoimikunta') return DEFAULT_JUHLATOIMIKUNTA_TEAMS;
  return EMPTY_TEAMS;
}

export function getOrgTeamMembers(orgSlug: string): OrgTeamMember[] {
  if (orgSlug === 'llff') return DEFAULT_LLFF_TEAM_MEMBERS;
  if (orgSlug === 'avl') return DEFAULT_AVL_TEAM_MEMBERS;
  if (orgSlug === 'juhlatoimikunta') return DEFAULT_JUHLATOIMIKUNTA_TEAM_MEMBERS;
  return EMPTY_MEMBERS;
}

// ── Apurahat ───────────────────────────────────────────────────

export function getOrgGrants(orgSlug: string): Grant[] {
  if (orgSlug === 'llff') return LLFF_GRANTS_DEFAULT;
  return EMPTY_GRANTS;
}

export function getOrgGrantsSettings(orgSlug: string): GrantsSettings {
  if (orgSlug === 'llff') return DEFAULT_GRANTS_SETTINGS;
  return EMPTY_GRANTS_SETTINGS;
}

// ── Viestintäsuunnitelma ───────────────────────────────────────

export function getOrgCommsPlan(orgSlug: string): CommsPlan {
  if (orgSlug === 'llff') return DEFAULT_LLFF_2026_PLAN;
  if (orgSlug === 'juhlatoimikunta') return DEFAULT_JUHLATOIMIKUNTA_COMMS_PLAN;
  return DEFAULT_AVL_COMMS_PLAN;
}

// ── Vuosikello ─────────────────────────────────────────────────

export function getOrgYearwheel(orgSlug: string): YearPhase[] {
  if (orgSlug === 'llff') return defaultLlffYearwheel;
  if (orgSlug === 'avl') return DEFAULT_AVL_YEARWHEEL;
  if (orgSlug === 'juhlatoimikunta') return DEFAULT_JUHLATOIMIKUNTA_YEARWHEEL;
  return EMPTY_YEARWHEEL;
}

// ── Näyttönimet ────────────────────────────────────────────────

const ORG_DISPLAY_NAMES: Record<string, string> = {
  llff: 'Lapinlahden Elokuvajuhlat (LLFF)',
  avl: 'Aivovammaliitto (AVL)',
  juhlatoimikunta: 'Juhlatoimikunta — Sirpan 70v',
};

export function getOrgDisplayName(orgSlug: string): string {
  return ORG_DISPLAY_NAMES[orgSlug] || orgSlug || 'Organisaatio';
}

// ── Kanavat ────────────────────────────────────────────────────

const ORG_CHANNELS: Record<string, string[]> = {
  llff: ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube', 'Nettisivut', 'Uutiskirje'],
  avl: ['Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'YouTube', 'Nettisivut', 'Uutiskirje', 'Jäsenkirje', 'Aivoitus-lehti', 'Lehdistötiedotteet', 'Esitteet'],
  juhlatoimikunta: ['WhatsApp', 'Sähköposti'],
};

export function getOrgChannels(orgSlug: string): string[] {
  return ORG_CHANNELS[orgSlug] || DEFAULT_CHANNELS;
}

// ── Sidebar-bannerit ───────────────────────────────────────────

const ORG_BANNERS: Record<string, string> = {
  llff: '/brand/llff-banner-2026.png',
  // avl: '/brand/avl-banner.png',  // lisätään kun banneri on valmis
};

export function getOrgBanner(orgSlug: string): string | undefined {
  return ORG_BANNERS[orgSlug];
}
