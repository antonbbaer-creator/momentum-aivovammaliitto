// Aivot: organisaation koko tietopohja (miksi olemassa, arvot, tavoitteet, strategia, toimintatavat,
// asiakkaat, projektit, myynti, ihmiset, päätökset, agenttien ehdotukset).
//
// Tietomalli Firestoressa (kaikki orgin alla, joten org-raja on polussa):
//   organizations/{orgId}/brainSections/{slug}
//   organizations/{orgId}/brainNotes/{slug}                 (+ revisions/{version})
//   organizations/{orgId}/brainNoteNames/{nameKey}          nimen yksikäsitteisyys: { slug }
//   organizations/{orgId}/brainDecisions/{id}
//   organizations/{orgId}/brainProposals/{id}
//   organizations/{orgId}/brainGoals/{id}
//   organizations/{orgId}/brainMetricEntries/{id}
//   organizations/{orgId}/brainInbox/{id}
//   organizations/{orgId}/brainTemplates/{id}
//   organizations/{orgId}/brainViews/{id}                   koontinäkymien määrittelyt (Obsidianin base-näkymät)
//   organizations/{orgId}/brainAuditLog/{id}
//   brainAgentTokens/{sha256}                                (vain palvelin)
//
// Selain lukee suoraan (säännöt rajaavat orgin jäseniin). Kaikki kirjoitukset kulkevat
// /api/brain-reittien kautta, jotka tallentavat version ja audit-rivin samassa transaktiossa.
// Suunnitelma: docs/hetki-brain-plan.md. Hetki-kohtaista sisältöä ei ole koodissa, se tulee tuonnista.

export {
  slugify, nameKey, parseWikilinks, extractReviewItems, isDraftNotDecision, computeLinks, renameLinks,
  sectionUnderHeading, appendToBody, parseFrontmatter, serializeFrontmatter, safeFileName, searchNotes,
  proposalSources, stableId, tokenize,
} from './brain-core.mjs';

export type NoteKind = 'core' | 'note' | 'agent_instructions' | 'inbox_entry' | 'proposal';
export type ChangeSource = 'user' | 'agent' | 'import' | 'inbox';
export type ProposalStatus = 'uusi' | 'hyväksytty' | 'hylätty' | 'myöhemmin';
export type InboxStatus = 'uusi' | 'käsitelty' | 'ehdotettu' | 'hyväksytty' | 'hylätty';
export type InboxChannel = 'web' | 'voice' | 'api' | 'siri';
export type ActorType = 'user' | 'agent';
export type BrainRole = 'owner' | 'admin' | 'member' | 'visitor';
export type AgentScope = 'read' | 'inbox:write' | 'proposals:write';

export const AGENT_SCOPES: { id: AgentScope; label: string; detail: string }[] = [
  { id: 'read', label: 'Lukeminen', detail: 'Muistiinpanot, haku, tavoitteet, ehdotukset ja päätökset' },
  { id: 'inbox:write', label: 'Kirjaukset', detail: 'Uusi kirjaus Inboxiin (esim. Siri-pikakomento)' },
  { id: 'proposals:write', label: 'Ehdotukset', detail: 'Uusi ehdotus hyväksyntäjonoon' },
];

export const BRAIN_COLLECTIONS = {
  sections: 'brainSections',
  notes: 'brainNotes',
  noteNames: 'brainNoteNames',
  revisions: 'revisions',
  decisions: 'brainDecisions',
  proposals: 'brainProposals',
  goals: 'brainGoals',
  metrics: 'brainMetricEntries',
  inbox: 'brainInbox',
  templates: 'brainTemplates',
  views: 'brainViews',
  audit: 'brainAuditLog',
} as const;

export const AGENT_TOKENS_COLLECTION = 'brainAgentTokens';

/**
 * Organisaatiot, joilla aivot ovat käytössä. Rajaus pätee sivupalkkiin, moduuliasetuksiin, sivuihin ja API:in.
 * Uuden organisaation käyttöönotto: lisää orgin tunniste tähän (Antonin päätös).
 */
export const BRAIN_ENABLED_ORGS: readonly string[] = ['hetki-company'];

export function isBrainEnabledOrg(orgId: string | null | undefined): boolean {
  return !!orgId && BRAIN_ENABLED_ORGS.includes(orgId);
}
export const AGENT_TOKEN_PREFIX = 'mbt_';

export interface BrainSection {
  slug: string;
  title: string;
  description?: string;
  sortOrder: number;
  parentSlug?: string | null;
}

export interface BrainNote {
  slug: string;
  sectionSlug: string;
  name: string;               // linkit viittaavat tähän: [[name]]
  nameKey: string;
  title: string;
  kind: NoteKind;
  properties: Record<string, string>;
  bodyMd: string;
  needsReview: boolean;       // tuonnin merkintä tai ⚠️-kohtia
  reviewItems: string[];      // ⚠️-rivit
  reviewNotes?: string;
  linksOut: string[];         // kohteiden slugit
  unresolvedLinks: string[];  // nameKeyt, joille ei ole muistiinpanoa (tulevat sivut)
  linkAliases?: Record<string, string>;
  isDraft?: boolean;          // "Ehdotus, ei päätös" / "Luonnos, ei päätös"
  sourcePath?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface BrainRevision {
  version: number;
  title: string;
  name: string;
  bodyMd: string;
  properties: Record<string, string>;
  changedBy: string;
  changedByName?: string;
  changeSource: ChangeSource;
  changeReason?: string;
  createdAt: number;
}

export interface BrainDecision {
  id: string;
  decidedOn: string;          // YYYY-MM-DD tai vapaa päiväys tuonnista
  decision: string;
  rationale?: string;
  area?: string;              // alkuperäinen alue-teksti
  areaSlug?: string | null;
  source: 'user' | 'proposal' | 'inbox';
  proposalId?: string | null;
  createdBy: string;
  createdAt: number;
}

export interface BrainProposal {
  id: string;
  title: string;
  bodyMd: string;
  status: ProposalStatus;
  area?: string;
  impact?: string;
  urgency?: string;
  sources: string[];
  noteSlug?: string | null;   // muistiinpano, jossa ehdotuksen teksti (tuonti)
  createdBy: string;          // agentin nimi tai käyttäjä
  createdAt: number;
  decidedBy?: string | null;
  decidedAt?: number | null;
  decisionNote?: string | null;
  snoozeUntil?: string | null; // YYYY-MM-DD, "myöhemmin"
  // Muistiinpanomuutos agentilta: hyväksyntä kirjoittaa sen aivoihin
  operation?: BrainOperation | null;
}

export interface GoalBreakdown {
  key: string;
  label: string;
  targetValue: number;
}

export interface BrainGoal {
  id: string;
  period: string;             // esim. "2027"
  title: string;
  targetValue: number;
  stretchValue?: number | null;
  baselineValue?: number | null;
  baselinePeriod?: string | null;
  unit: string;               // "€"
  breakdown: GoalBreakdown[];
  noteSlug?: string | null;
  sortOrder?: number;
}

export interface BrainMetricEntry {
  id: string;
  goalId: string;
  breakdownKey?: string | null;
  period: string;
  value: number;
  note?: string;
  createdBy: string;
  createdAt: number;
}

// ── Kirjaa: tekoälyn ehdottamat operaatiot ───────────────────────

export type BrainOperation =
  | { type: 'append_to_note'; targetSlug: string; heading?: string | null; content: string; reason: string }
  | { type: 'update_property'; targetSlug: string; key: string; value: string; reason: string }
  | { type: 'create_note'; name: string; title?: string; sectionSlug: string; kind?: NoteKind; properties?: Record<string, string>; content: string; reason: string }
  | { type: 'add_decision'; decidedOn: string; decision: string; rationale?: string; areaSlug?: string | null; reason: string }
  | { type: 'add_proposal'; title: string; content: string; area?: string; impact?: string; urgency?: string; reason: string }
  | { type: 'update_goal_metric'; goalId: string; breakdownKey?: string | null; period: string; value: number; note?: string; reason: string };

export type BrainOperationType = BrainOperation['type'];

export const OPERATION_LABELS: Record<BrainOperationType, string> = {
  append_to_note: 'Lisää muistiinpanoon',
  update_property: 'Päivitä ominaisuus',
  create_note: 'Uusi muistiinpano',
  add_decision: 'Kirjaa päätös',
  add_proposal: 'Uusi ehdotus',
  update_goal_metric: 'Päivitä tavoitteen toteuma',
};

export interface InboxSuggestion {
  summary: string;
  operations: BrainOperation[];
  questions: string[];        // jos kohde on epäselvä, tekoäly kysyy
  model?: string;
  createdAt: number;
}

export interface BrainInboxEntry {
  id: string;
  rawText: string;
  audioPath?: string | null;
  transcript?: string | null;
  channel: InboxChannel;
  status: InboxStatus;
  aiSuggestion?: InboxSuggestion | null;
  error?: string | null;
  appliedOperations?: number;
  createdBy: string;
  createdByName?: string;
  createdAt: number;
  processedAt?: number | null;
}

export interface BrainTemplate {
  id: string;
  name: string;
  kind: NoteKind;
  sectionSlug?: string | null;
  propertiesTemplate: Record<string, string>;
  bodyMd: string;
}

/** Koontinäkymä (Obsidianin base-näkymän vastine): taulukko muistiinpanoista suodatettuna ominaisuuksilla. */
export interface BrainView {
  id: string;
  title: string;
  sectionSlug?: string | null;
  filter?: Record<string, string>;   // ominaisuus → arvo (esim. { tila: 'käynnissä' })
  columns: string[];                 // ominaisuuksien avaimet
  sortOrder?: number;
  raw?: string;                      // alkuperäinen määrittely
}

export interface BrainAuditEntry {
  id: string;
  actorType: ActorType;
  actorId: string;
  actorName?: string;
  action: string;
  entity: string;
  entityId: string;
  diff?: Record<string, unknown>;
  createdAt: number;
}

export interface AgentTokenInfo {
  id: string;                 // tiivisteen alku, ei itse tiiviste
  name: string;
  scopes: AgentScope[];
  createdBy: string;
  createdAt: number;
  lastUsedAt?: number | null;
  revokedAt?: number | null;
  expiresAt?: number | null;
}

// ── Apurit ──────────────────────────────────────────────────────

export const PROPOSAL_STATUS_META: Record<ProposalStatus, { label: string; color: string }> = {
  uusi: { label: 'Uusi', color: 'var(--hetki-blue)' },
  myöhemmin: { label: 'Myöhemmin', color: 'var(--t3)' },
  hyväksytty: { label: 'Hyväksytty', color: 'var(--green)' },
  hylätty: { label: 'Hylätty', color: 'var(--red)' },
};

export const INBOX_STATUS_META: Record<InboxStatus, { label: string; color: string }> = {
  uusi: { label: 'Uusi', color: 'var(--hetki-blue)' },
  ehdotettu: { label: 'Odottaa hyväksyntää', color: 'var(--pink)' },
  käsitelty: { label: 'Käsitelty', color: 'var(--t3)' },
  hyväksytty: { label: 'Hyväksytty', color: 'var(--green)' },
  hylätty: { label: 'Hylätty', color: 'var(--t3)' },
};

export const KIND_LABELS: Record<NoteKind, string> = {
  core: 'Ydin',
  note: 'Muistiinpano',
  agent_instructions: 'Agentin ohje',
  inbox_entry: 'Kirjaus',
  proposal: 'Ehdotus',
};

/** Onko "myöhemmin"-ehdotus palannut uusien joukkoon. */
export function proposalIsDue(p: BrainProposal, today: string): boolean {
  return p.status === 'myöhemmin' && !!p.snoozeUntil && p.snoozeUntil <= today;
}

/** Tämä päivä muodossa YYYY-MM-DD Suomen ajassa (palvelin ajaa UTC:ssä, selain paikallisessa ajassa). */
export function todayIso(now = Date.now(), timeZone = 'Europe/Helsinki'): string {
  // sv-SE-muotoilu tuottaa ISO-päivämäärän
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

export function canEditBrain(role: BrainRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

export function canAdminBrain(role: BrainRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function formatValue(v: number, unit: string): string {
  const n = new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 0 }).format(v);
  return unit ? `${n} ${unit}` : n;
}

/** Tavoitteen toteuma: kauden viimeisin arvo per osa (breakdownKey), summattuna. */
export function goalProgress(goal: BrainGoal, entries: BrainMetricEntry[]): { total: number; byKey: Record<string, number> } {
  const byKey: Record<string, { value: number; at: number }> = {};
  for (const e of entries) {
    if (e.goalId !== goal.id || e.period !== goal.period) continue;
    const k = e.breakdownKey || '_';
    if (!byKey[k] || e.createdAt > byKey[k].at) byKey[k] = { value: e.value, at: e.createdAt };
  }
  const flat: Record<string, number> = {};
  for (const [k, v] of Object.entries(byKey)) flat[k] = v.value;
  const breakdown = Array.isArray(goal.breakdown) ? goal.breakdown : [];
  const parts = breakdown.map(b => flat[b.key] || 0).reduce((a, b) => a + b, 0);
  // Osittain kirjattu: osien summa. Jos osia ei ole kirjattu, käytetään kokonaisarvoa.
  const total = breakdown.length && parts > 0 ? parts : (flat._ || 0);
  return { total, byKey: flat };
}

export const EMPTY_SECTIONS: BrainSection[] = [];
export const EMPTY_NOTES: BrainNote[] = [];
