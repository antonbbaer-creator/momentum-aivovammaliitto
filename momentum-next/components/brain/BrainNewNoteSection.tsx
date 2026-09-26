'use client';

// Uusi muistiinpano aivoihin: pohjasta tai tyhjästä. URL-parametrit ?pohja=, ?osio= ja ?nimi= esitäyttävät
// lomakkeen (esim. "Tulevat sivut" -listan Luo-linkki). Pohjan {{title}} korvautuu nimellä ja {{date}} päivämäärällä.

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/lib/toast';
import { brainApi, BrainApiError, useBrainAccess, useBrainNotes, useBrainSections, useBrainTemplates } from '@/lib/use-brain';
import { KIND_LABELS, todayIso, type BrainSection, type BrainTemplate } from '@/lib/brain-shared';
import BrainMarkdown from './BrainMarkdown';
import { brainCard, brainLabel, noteHref, useBrainBase, useWikiResolver } from './BrainShell';
import {
  FORBIDDEN_NAME_CHARS, PropertyRowsEditor, propsFromRows, rowsFromProps, type PropRow,
} from './BrainNoteSection';
import TabSwitcher from '@/components/TabSwitcher';

export default function BrainNewNoteSection() {
  return (
    <Suspense fallback={<div style={{ ...brainCard, color: 'var(--t2)' }}>Ladataan…</div>}>
      <NewNoteLoader />
    </Suspense>
  );
}

/** Obsidianin pohjamuuttujat: {{title}} → nimi (jos annettu), {{date}} → YYYY-MM-DD. */
function fillTemplate(text: string, name: string, today: string): string {
  let out = text.replace(/\{\{\s*date\s*\}\}/gi, today);
  if (name.trim()) out = out.replace(/\{\{\s*title\s*\}\}/gi, name.trim());
  return out;
}

function fillProps(props: Record<string, string> | undefined, name: string, today: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props || {})) out[k] = fillTemplate(String(v ?? ''), name, today);
  return out;
}

function NewNoteLoader() {
  const params = useSearchParams();
  const { orgId, canEdit } = useBrainAccess();
  const templates = useBrainTemplates(orgId);
  const sections = useBrainSections(orgId);

  if (!orgId || templates.loading || sections.loading) {
    return <div style={{ ...brainCard, color: 'var(--t2)' }}>Ladataan…</div>;
  }
  if (!canEdit) {
    return (
      <div role="alert" style={{ ...brainCard, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Sinulla ei ole oikeutta luoda muistiinpanoja.</div>
        <div style={{ fontSize: 14, color: 'var(--t2)' }}>Voit lukea aivoja. Pyydä organisaation ylläpitäjältä muokkausoikeus, jos tarvitset sitä.</div>
      </div>
    );
  }
  const tplId = params.get('pohja') || '';
  const template = templates.data.find(t => t.id === tplId) || null;
  return (
    <NewNoteForm
      orgId={orgId}
      templates={templates.data}
      sections={sections.data}
      initialTemplate={template}
      initialName={params.get('nimi') || ''}
      initialSection={params.get('osio') || ''}
    />
  );
}

interface FormState {
  templateId: string;
  name: string;
  title: string;
  sectionSlug: string;
  rows: PropRow[];
  bodyMd: string;
}

function NewNoteForm({ orgId, templates, sections, initialTemplate, initialName, initialSection }: {
  orgId: string; templates: BrainTemplate[]; sections: BrainSection[]; initialTemplate: BrainTemplate | null; initialName: string; initialSection: string;
}) {
  const router = useRouter();
  const base = useBrainBase();
  const { toast } = useToast();
  const notes = useBrainNotes(orgId);
  const resolve = useWikiResolver(notes.data);
  const [today] = useState(() => todayIso());
  const [f, setF] = useState<FormState>(() => {
    const day = todayIso();
    const known = (s: string | null | undefined) => !!s && sections.some(x => x.slug === s);
    const section = known(initialSection) ? initialSection : known(initialTemplate?.sectionSlug) ? String(initialTemplate?.sectionSlug) : (sections[0]?.slug || '');
    return {
      templateId: initialTemplate?.id || '',
      name: initialName,
      title: '',
      sectionSlug: section,
      rows: rowsFromProps(initialTemplate ? fillProps(initialTemplate.propertiesTemplate, initialName, day) : {}),
      bodyMd: initialTemplate ? fillTemplate(initialTemplate.bodyMd || '', initialName, day) : '',
    };
  });
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const set = (patch: Partial<FormState>) => setF(prev => ({ ...prev, ...patch }));
  const template = templates.find(t => t.id === f.templateId) || null;
  const nameTrim = f.name.trim();
  const nameBad = FORBIDDEN_NAME_CHARS.test(f.name);

  const chooseTemplate = (id: string) => {
    const t = templates.find(x => x.id === id) || null;
    const hasContent = f.bodyMd.trim() !== '' || f.rows.some(r => r.key.trim() || r.value.trim());
    if (hasContent && !window.confirm('Pohjan vaihto korvaa nykyisen sisällön ja ominaisuudet. Jatketaanko?')) return;
    setF(prev => ({
      ...prev,
      templateId: id,
      sectionSlug: t?.sectionSlug && sections.some(s => s.slug === t.sectionSlug) ? t.sectionSlug : prev.sectionSlug,
      rows: rowsFromProps(t ? fillProps(t.propertiesTemplate, prev.name, today) : {}),
      bodyMd: t ? fillTemplate(t.bodyMd || '', prev.name, today) : '',
    }));
  };

  const create = async () => {
    if (saving) return;
    setTouched(true);
    if (!nameTrim) { setError('Anna muistiinpanolle nimi.'); return; }
    if (nameBad) { setError('Nimessä ei voi olla merkkejä [ ] | # ^'); return; }
    if (!f.sectionSlug) { setError('Valitse osio.'); return; }
    setSaving(true);
    setError(null);
    try {
      // Jäljelle jääneet {{title}}-muuttujat korvataan nimellä vasta nyt, kun nimi on varmasti annettu
      const props = propsFromRows(f.rows);
      const res = await brainApi<{ slug: string; version: number; created: boolean; renamedBacklinks: number }>('notes', {
        body: {
          orgId,
          note: {
            name: nameTrim,
            title: f.title.trim() || nameTrim,
            sectionSlug: f.sectionSlug,
            kind: template?.kind || 'note',
            properties: fillProps(props, nameTrim, today),
            bodyMd: fillTemplate(f.bodyMd, nameTrim, today),
          },
        },
      });
      toast('Muistiinpano luotu', 'success');
      router.push(noteHref(base, res.slug));
    } catch (e) {
      if (e instanceof BrainApiError && e.status === 409) {
        setError(`${e.message} Valitse toinen nimi.`);
      } else {
        setError(e instanceof Error ? e.message : 'Muistiinpanon luonti epäonnistui');
      }
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void create();
    }
  };

  const labelStyle: React.CSSProperties = { ...brainLabel, display: 'block', marginBottom: 4 };
  const showNameError = nameBad || (touched && !nameTrim);

  if (sections.length === 0) {
    return (
      <div style={{ ...brainCard, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Aivoissa ei ole vielä osioita.</div>
        <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 10 }}>Muistiinpano tarvitsee osion. Tuo aivot tai pyydä ylläpitäjää lisäämään osiot.</div>
        <Link href={base} className="btn btn-secondary btn-sm" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Siirry Aivojen kotiin</Link>
      </div>
    );
  }

  return (
    <div onKeyDown={onKeyDown} style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, margin: 0 }}>Uusi muistiinpano</h1>

      <div>
        <label htmlFor="brain-new-tpl" style={labelStyle}>Pohja</label>
        <select id="brain-new-tpl" className="input" value={f.templateId} onChange={e => chooseTemplate(e.target.value)}
          aria-describedby="brain-new-tpl-help" style={{ width: '100%', maxWidth: 420, minHeight: 44 }}>
          <option value="">Tyhjä muistiinpano</option>
          {[...templates].sort((a, b) => a.name.localeCompare(b.name, 'fi')).map(t => (
            <option key={t.id} value={t.id}>{t.name} ({KIND_LABELS[t.kind] || t.kind})</option>
          ))}
        </select>
        <div id="brain-new-tpl-help" style={{ fontSize: 12.5, color: 'var(--t3)', marginTop: 4 }}>
          Pohjan {'{{title}}'} korvautuu nimellä ja {'{{date}}'} tämän päivän päivämäärällä ({today}).
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div>
          <label htmlFor="brain-new-name" style={labelStyle}>Nimi (pakollinen)</label>
          <input id="brain-new-name" className="input" value={f.name}
            onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(true)}
            aria-invalid={showNameError} aria-describedby="brain-new-name-help" style={{ width: '100%', minHeight: 44 }} />
          <div id="brain-new-name-help" style={{ fontSize: 12.5, color: showNameError ? 'var(--red)' : 'var(--t3)', marginTop: 4 }}>
            {nameBad
              ? 'Nimessä ei voi olla merkkejä [ ] | # ^'
              : showNameError
                ? 'Anna nimi.'
                : 'Muut muistiinpanot linkittävät tähän nimellä, esim. [[Nimi]]. Nimen on oltava yksilöllinen.'}
          </div>
        </div>
        <div>
          <label htmlFor="brain-new-title" style={labelStyle}>Otsikko (valinnainen)</label>
          <input id="brain-new-title" className="input" value={f.title} placeholder={nameTrim || 'Oletuksena nimi'}
            onChange={e => set({ title: e.target.value })} style={{ width: '100%', minHeight: 44 }} />
        </div>
        <div>
          <label htmlFor="brain-new-section" style={labelStyle}>Osio (pakollinen)</label>
          <select id="brain-new-section" className="input" value={f.sectionSlug} onChange={e => set({ sectionSlug: e.target.value })}
            style={{ width: '100%', minHeight: 44 }}>
            {!f.sectionSlug && <option value="">Valitse osio</option>}
            {sections.map(s => <option key={s.slug} value={s.slug}>{s.parentSlug ? '– ' : ''}{s.title}</option>)}
          </select>
        </div>
      </div>

      <PropertyRowsEditor rows={f.rows} onChange={rows => set({ rows })} idPrefix="brain-new-prop" />

      <div>
        <TabSwitcher
          tabs={[{ id: 'edit', label: 'Muokkaa' }, { id: 'preview', label: 'Esikatsele' }]}
          active={tab}
          onChange={id => setTab(id === 'preview' ? 'preview' : 'edit')}
          style={{ marginBottom: 8 }}
        />
        {tab === 'edit' ? (
          <>
            <label htmlFor="brain-new-body" style={labelStyle}>Sisältö (markdown)</label>
            <textarea id="brain-new-body" className="input" value={f.bodyMd} rows={20} spellCheck
              onChange={e => set({ bodyMd: e.target.value })}
              style={{ width: '100%', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 14, lineHeight: 1.55, resize: 'vertical' }} />
          </>
        ) : (
          <div role="region" aria-label="Esikatselu" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 16px', minHeight: 200 }}>
            {f.bodyMd.trim()
              ? <BrainMarkdown source={fillTemplate(f.bodyMd, nameTrim, today)} resolve={resolve} />
              : <div style={{ fontSize: 14, color: 'var(--t3)' }}>Ei sisältöä.</div>}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" style={{ padding: '8px 12px', borderLeft: '4px solid var(--red)', background: 'rgba(193,69,69,.08)', borderRadius: '0 var(--r) var(--r) 0', fontSize: 14, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={saving} style={{ minHeight: 44 }}>
          {saving ? 'Luodaan…' : 'Luo muistiinpano'}
        </button>
        <Link href={base} className="btn btn-secondary" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Peru</Link>
      </div>
    </div>
  );
}
