'use client';

// Aivojen yhteinen kehys: välilehdet (Koti, Kirjaa, Ehdotukset, Kysy, Asetukset), haku ja osiopuu.
// Kaikki aivojen sivut käyttävät tätä AppShellin sisällä. Osiopuu näkyy vasemmalla leveällä näytöllä
// ja avattavana listana puhelimella.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useIsMobile } from '@/lib/use-mobile';
import { useBrainAccess, useBrainNotes, useBrainSections, useBrainProposals, useBrainInbox, useNoteIndex } from '@/lib/use-brain';
import { nameKey, searchNotes, proposalIsDue, todayIso, type BrainNote, type BrainSection } from '@/lib/brain-shared';
import type { WikiTarget } from './BrainMarkdown';

export function useBrainBase(): string {
  const orgSlug = (useParams().orgSlug as string) || '';
  return `/${orgSlug}/aivot`;
}

export function noteHref(base: string, slug: string): string {
  return `${base}/m/${encodeURIComponent(slug)}`;
}

/** Wikilinkin ratkaisu: nimi → muistiinpanon osoite. */
export function useWikiResolver(notes: BrainNote[]): (target: string, heading: string | null) => WikiTarget {
  const base = useBrainBase();
  const { byKey } = useNoteIndex(notes);
  return useCallback((target: string, heading: string | null) => {
    if (!target && heading) return { href: `#${encodeURIComponent(heading.toLowerCase().replace(/\s+/g, '-'))}`, label: heading, exists: true };
    const n = byKey.get(nameKey(target));
    if (!n) return { href: null, label: target, exists: false };
    const hash = heading ? `#${encodeURIComponent(heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-'))}` : '';
    return { href: noteHref(base, n.slug) + hash, label: n.title || n.name, exists: true };
  }, [byKey, base]);
}

export const brainCard: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem 1.25rem',
};
export const brainLabel: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--t3)',
};

interface ShellProps {
  children: React.ReactNode;
  activeSlug?: string | null;
  showTree?: boolean;
}

export default function BrainShell({ children, activeSlug, showTree = true }: ShellProps) {
  const base = useBrainBase();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { orgId } = useBrainAccess();
  const sections = useBrainSections(orgId);
  const notes = useBrainNotes(orgId);
  const proposals = useBrainProposals(orgId);
  const inbox = useBrainInbox(orgId);
  const [treeOpen, setTreeOpen] = useState(false);

  // Päivä lasketaan kerran avaushetkellä (ei renderissä)
  const [today] = useState(() => todayIso());
  const newProposals = proposals.data.filter(p => p.status === 'uusi' || proposalIsDue(p, today)).length;
  const openInbox = inbox.data.filter(e => e.status === 'uusi' || e.status === 'ehdotettu').length;

  const tabs = [
    { href: base, label: 'Koti', match: (p: string) => p === base },
    { href: `${base}/kirjaa`, label: 'Kirjaa', count: openInbox, match: (p: string) => p.startsWith(`${base}/kirjaa`) },
    { href: `${base}/ehdotukset`, label: 'Ehdotukset', count: newProposals, match: (p: string) => p.startsWith(`${base}/ehdotukset`) },
    { href: `${base}/kysy`, label: 'Kysy', match: (p: string) => p.startsWith(`${base}/kysy`) },
    { href: `${base}/asetukset`, label: 'Asetukset', match: (p: string) => p.startsWith(`${base}/asetukset`) },
  ];

  const empty = !sections.loading && !notes.loading && sections.data.length === 0 && notes.data.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <nav aria-label="Aivojen näkymät" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: 3, gap: 2, flexWrap: 'wrap' }}>
          {tabs.map(t => {
            const act = t.match(pathname || '');
            return (
              <Link key={t.href} href={t.href} className={`cal-view-btn ${act ? 'act' : ''}`} aria-current={act ? 'page' : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, textDecoration: 'none' }}>
                {t.label}
                {!!t.count && <span aria-label={`${t.count} uutta`} style={{ background: 'var(--pink)', color: 'var(--paper)', borderRadius: 10, fontSize: 11, padding: '0 6px', lineHeight: '18px' }}>{t.count}</span>}
              </Link>
            );
          })}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <BrainSearch notes={notes.data} />
        </div>
      </nav>

      {empty ? (
        <div style={{ ...brainCard, lineHeight: 1.6 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 6 }}>Aivot ovat vielä tyhjät</div>
          <div style={{ fontSize: 14, color: 'var(--t2)' }}>
            Aivot ovat organisaation koko tietopohja: miksi olette olemassa, arvot, tavoitteet, toimintatavat, asiakkaat, projektit ja päätökset.
            Tuo olemassa oleva vault komennolla <code>node scripts/import-brain.mjs</code> (ohje: <code>docs/aivot-kaytto.md</code>) tai aloita kirjaamalla.
          </div>
        </div>
      ) : showTree ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(200px, 250px) 1fr', gap: 20, alignItems: 'start' }}>
          {isMobile ? (
            <div>
              <button type="button" className="btn btn-secondary btn-sm" aria-expanded={treeOpen} onClick={() => setTreeOpen(v => !v)} style={{ minHeight: 44 }}>
                {treeOpen ? 'Piilota osiot' : 'Näytä osiot ja muistiinpanot'}
              </button>
              {treeOpen && <div style={{ marginTop: 10 }}><SectionTree sections={sections.data} notes={notes.data} activeSlug={activeSlug} onNavigate={() => setTreeOpen(false)} /></div>}
            </div>
          ) : (
            <aside aria-label="Osiot" style={{ position: 'sticky', top: 16, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <SectionTree sections={sections.data} notes={notes.data} activeSlug={activeSlug} />
            </aside>
          )}
          <div style={{ minWidth: 0 }}>{children}</div>
        </div>
      ) : children}
    </div>
  );
}

function SectionTree({ sections, notes, activeSlug, onNavigate }: { sections: BrainSection[]; notes: BrainNote[]; activeSlug?: string | null; onNavigate?: () => void }) {
  const base = useBrainBase();
  const activeSection = notes.find(n => n.slug === activeSlug)?.sectionSlug || null;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const bySection = useMemo(() => {
    const m = new Map<string, BrainNote[]>();
    const known = new Set(sections.map(s => s.slug));
    for (const n of notes) {
      const key = known.has(n.sectionSlug) ? n.sectionSlug : '__muut';
      const a = m.get(key) || [];
      a.push(n);
      m.set(key, a);
    }
    for (const a of m.values()) a.sort((x, y) => (x.kind === 'core' ? -1 : 0) - (y.kind === 'core' ? -1 : 0) || x.title.localeCompare(y.title, 'fi'));
    return m;
  }, [notes, sections]);
  const roots = sections.filter(s => !s.parentSlug);
  const children = (slug: string) => sections.filter(s => s.parentSlug === slug);
  const orphanSection = notes.some(n => !sections.find(s => s.slug === n.sectionSlug));

  const renderSection = (s: BrainSection, depth: number): React.ReactNode => {
    const list = bySection.get(s.slug) || [];
    const isOpen = open[s.slug] ?? (s.slug === activeSection);
    const id = `brain-sec-${s.slug}`;
    return (
      <li key={s.slug} style={{ listStyle: 'none' }}>
        <button type="button" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(o => ({ ...o, [s.slug]: !isOpen }))}
          title={s.description || undefined}
          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, background: 'none', border: 0, padding: '7px 6px', paddingLeft: 6 + depth * 12, color: 'var(--t1)', cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, minHeight: 36, borderRadius: 'var(--r)' }}>
          <span aria-hidden style={{ width: 12, color: 'var(--t3)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
          <span style={{ flex: 1 }}>{s.title}</span>
          <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 400 }}>{list.length}</span>
        </button>
        {isOpen && (
          <ul id={id} style={{ margin: 0, padding: 0 }}>
            {children(s.slug).map(c => renderSection(c, depth + 1))}
            {list.map(n => {
              const act = n.slug === activeSlug;
              return (
                <li key={n.slug} style={{ listStyle: 'none' }}>
                  <Link href={noteHref(base, n.slug)} onClick={onNavigate} aria-current={act ? 'page' : undefined}
                    style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 6px', paddingLeft: 24 + depth * 12, fontSize: 13.5, color: act ? 'var(--pri)' : 'var(--t2)', fontWeight: act ? 600 : 400, textDecoration: 'none', borderRadius: 'var(--r)', background: act ? 'var(--card2)' : undefined, minHeight: 32 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title || n.name}</span>
                    {n.needsReview && <span title="Vahvistettavia kohtia" aria-label="vahvistettavia kohtia" style={{ color: 'var(--red)', fontSize: 12 }}>⚠</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <ul style={{ margin: 0, padding: 0 }}>
      {roots.map(s => renderSection(s, 0))}
      {orphanSection && renderSection({ slug: '__muut', title: 'Muut', sortOrder: 9999 }, 0)}
    </ul>
  );
}

function BrainSearch({ notes }: { notes: BrainNote[] }) {
  const base = useBrainBase();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [openList, setOpenList] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const results = useMemo(() => (q.trim().length >= 2 ? searchNotes(notes, q, 12) : []), [notes, q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenList(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (slug: string) => {
    setOpenList(false);
    setQ('');
    router.push(noteHref(base, slug));
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label htmlFor="brain-search" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Hae aivoista</label>
      <input id="brain-search" className="input" type="search" placeholder="Hae aivoista…" value={q} autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-expanded={openList && results.length > 0} aria-controls="brain-search-list"
        aria-activedescendant={openList && results[active] ? `brain-sr-${results[active].note.slug}` : undefined}
        onChange={e => { setQ(e.target.value); setOpenList(true); setActive(0); }}
        onFocus={() => setOpenList(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active].note.slug); }
          if (e.key === 'Escape') setOpenList(false);
        }}
        style={{ width: '100%', minHeight: 40 }} />
      {openList && q.trim().length >= 2 && (
        <ul id="brain-search-list" role="listbox" aria-label="Hakutulokset"
          style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)', margin: 0, padding: 4, listStyle: 'none', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', boxShadow: '0 8px 24px rgba(0,0,0,.15)', maxHeight: 420, overflowY: 'auto' }}>
          {results.length === 0 && <li style={{ padding: 10, fontSize: 13, color: 'var(--t3)' }}>Ei osumia</li>}
          {results.map((r, i) => (
            <li key={r.note.slug} id={`brain-sr-${r.note.slug}`} role="option" aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); go(r.note.slug); }} onMouseEnter={() => setActive(i)}
              style={{ padding: '8px 10px', borderRadius: 'var(--r)', cursor: 'pointer', background: i === active ? 'var(--card2)' : undefined }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.note.title || r.note.name}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.snippet}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
