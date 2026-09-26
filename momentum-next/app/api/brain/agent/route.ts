// Aivojen agenttirajapinta (ajastetut Claude-agentit, iPhonen pikakomento / Siri).
// Tunnistus: Authorization: Bearer mbt_…  (organisaatiokohtainen, scopet, peruttavissa Asetukset-sivulla)
//
// GET  ?resource=sections                         osiot                      scope: read
// GET  ?resource=notes[&section=slug]             muistiinpanojen lista      scope: read
// GET  ?resource=note&slug=… | &name=…            yksi muistiinpano          scope: read
// GET  ?resource=search&q=…                       haku                       scope: read
// GET  ?resource=goals | proposals | decisions    tavoitteet ja toteumat, ehdotukset, päätökset
// POST { type: 'inbox', text, channel? }          uusi kirjaus Inboxiin      scope: inbox:write
// POST { type: 'proposal', title, bodyMd, area?, impact?, urgency?, sources?, operation? }
//                                                  uusi ehdotus               scope: proposals:write
// Muistiinpanomuutokset tulevat aina ehdotuksina (operation) hyväksyntäjonoon, eivät suoraan aivoihin.
// Jokainen kutsu kirjataan audit-lokiin.
import { NextResponse } from 'next/server';
import {
  handle, readJson, requireAgent, audit, col, getNote, findNoteByName, searchBrain, loadNotes,
  createInboxEntry, createProposal, parseOperation, str, BrainError,
} from '@/lib/brain-server';
import { adminDb } from '@/lib/firebase-admin';
import { BRAIN_COLLECTIONS as C, type InboxChannel } from '@/lib/brain-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await requireAgent(req, 'read');
    const url = new URL(req.url);
    const resource = url.searchParams.get('resource') || '';
    const db = adminDb();
    let result: unknown;
    switch (resource) {
      case 'sections':
        result = (await col(db, actor.orgId, C.sections).orderBy('sortOrder').get()).docs.map(d => d.data());
        break;
      case 'notes': {
        const section = url.searchParams.get('section');
        const notes = await loadNotes(actor.orgId);
        result = notes
          .filter(n => !section || n.sectionSlug === section)
          .map(n => ({ slug: n.slug, name: n.name, title: n.title, sectionSlug: n.sectionSlug, kind: n.kind, properties: n.properties, needsReview: n.needsReview, isDraft: !!n.isDraft, updatedAt: n.updatedAt }));
        break;
      }
      case 'note': {
        const slug = url.searchParams.get('slug');
        const name = url.searchParams.get('name');
        const n = slug ? await getNote(actor.orgId, slug) : name ? await findNoteByName(actor.orgId, name) : null;
        if (!n) throw new BrainError(404, 'Muistiinpanoa ei löydy');
        result = n;
        break;
      }
      case 'search':
        result = await searchBrain(actor.orgId, (url.searchParams.get('q') || '').slice(0, 200), 20);
        break;
      case 'goals': {
        const [g, m] = await Promise.all([col(db, actor.orgId, C.goals).get(), col(db, actor.orgId, C.metrics).get()]);
        result = { goals: g.docs.map(d => d.data()), entries: m.docs.map(d => d.data()) };
        break;
      }
      case 'proposals':
        result = (await col(db, actor.orgId, C.proposals).get()).docs.map(d => d.data());
        break;
      case 'decisions':
        result = (await col(db, actor.orgId, C.decisions).get()).docs.map(d => d.data());
        break;
      default:
        throw new BrainError(400, 'resource: sections, notes, note, search, goals, proposals tai decisions');
    }
    await audit(actor, 'agent.read', resource, url.searchParams.get('slug') || url.searchParams.get('name') || '-', {});
    return NextResponse.json({ ok: true, data: result });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const type = str(body.type, 20);
    if (type === 'inbox') {
      const actor = await requireAgent(req, 'inbox:write');
      const ch = str(body.channel, 10);
      const channel: InboxChannel = ch === 'siri' || ch === 'voice' ? ch : 'api';
      const id = await createInboxEntry(actor, { rawText: str(body.text, 20_000), channel });
      return { ok: true, id };
    }
    if (type === 'proposal') {
      const actor = await requireAgent(req, 'proposals:write');
      const operation = body.operation ? parseOperation(body.operation, 'agent') : null;
      if (body.operation && !operation) throw new BrainError(400, 'operation ei kelpaa');
      const id = await createProposal(actor, {
        title: str(body.title, 300), bodyMd: str(body.bodyMd, 50_000), area: str(body.area, 200) || undefined,
        impact: str(body.impact, 100) || undefined, urgency: str(body.urgency, 100) || undefined,
        sources: (Array.isArray(body.sources) ? body.sources : []).map(s => String(s)), operation,
      });
      return { ok: true, id };
    }
    throw new BrainError(400, "type: 'inbox' tai 'proposal'");
  });
}
