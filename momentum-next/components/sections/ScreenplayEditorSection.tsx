'use client';

// Käsikirjoituseditori — kokoruudun keskittymistila.
//
// Kulku: setup (kirjoitusajan valinta) → entering ("FADE IN:" -animaatio +
// selaimen kokoruututila) → writing (tumma häiriötön editori, aika valuu
// sivussa). Kokoruudusta poistuminen tai ajan täyttyminen avaa varmistuksen.
//
// Näppäimet kirjoitustilassa:
//   Enter        → uusi elementti (tyyppi alan käytännön mukaan, esim. hahmo → dialogi)
//   Tab / ⇧Tab   → vaihda elementin tyyppiä
//   Backspace    → rivin alussa yhdistää edelliseen elementtiin
//   Alt+1…6      → aseta tyyppi suoraan
//   "INT./EXT."  → toimintarivi muuttuu automaattisesti kohtausotsikoksi

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import {
  ScreenplayMeta, ScreenplayDoc, ScreenplayElement, ScreenplayElementType,
  ScreenplayVersion, ELEMENT_LABELS, ELEMENT_LAYOUT, ELEMENT_TYPE_CYCLE,
  NEXT_ON_ENTER, REVISION_COLORS, newId, emptyDoc, detectAutoType, paginate,
  extractScenes, extractCharacterStats, countWords, capVersions, toFountain,
} from '@/lib/screenplay-shared';

type Phase = 'setup' | 'entering' | 'writing';
type PanelTab = 'kohtaukset' | 'hahmot' | 'versiot' | 'tiedot';

const PRESET_MINUTES = [15, 25, 45, 90];

// Hetki-brändin tumman tilan väriarvot — keskittymistila on aina tumma,
// riippumatta sovelluksen teemasta
const DARK = {
  bg: '#14120F', card: '#1B1815', elev: '#221E1A', border: '#2E2A24',
  t1: '#E8E2D5', t2: '#B5AC9C', t3: '#7A7263', dim: '#544D41',
  yellow: '#F1B434', pink: '#E45C81',
};

const BRAND_BAND = ['#056B9F', '#185E5B', '#F1B434', '#E45C81', '#303030'];

// Visuaalinen ylämarginaali elementtityypeittäin (em) kirjoitusnäkymässä
const SCREEN_GAP: Record<ScreenplayElementType, string> = {
  scene: '1.7em', action: '.85em', character: '.85em',
  dialogue: '0', parenthetical: '0', transition: '.85em',
};

function autoResize(ta: HTMLTextAreaElement) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function fmtTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ScreenplayEditorSection() {
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const scriptId = (params.scriptId as string) || '';
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // ── Data ──────────────────────────────────────────────────────────────────

  const [index, setIndex, indexLoading] = useOrgData<ScreenplayMeta[]>('screenplays', []);
  const emptyDefault = useMemo(() => emptyDoc(), [scriptId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [docVal, setDocVal, docLoading] = useOrgData<ScreenplayDoc>(`screenplay_doc_${scriptId}`, emptyDefault);
  const [versions, setVersions] = useOrgData<ScreenplayVersion[]>(`screenplay_versions_${scriptId}`, []);

  const meta = index.find(s => s.id === scriptId);

  // ── Istunnon tila ─────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<Phase>('setup');
  const [selMinutes, setSelMinutes] = useState<number>(25);
  const [customMinutes, setCustomMinutes] = useState('');
  const [sessionSecs, setSessionSecs] = useState(25 * 60);
  const [remaining, setRemaining] = useState(25 * 60);
  const [timeUp, setTimeUp] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const exitingRef = useRef(false);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>('kohtaukset');
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [versionName, setVersionName] = useState('');
  const [versionColor, setVersionColor] = useState(REVISION_COLORS[0].id);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const elRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const pendingFocus = useRef<{ id: string; pos: number } | null>(null);
  const lastTouch = useRef(0);

  // Vanhoissa dokumenteissa voi puuttua kenttiä — normalisoidaan aina
  const elements = useMemo(() => docVal.elements ?? [], [docVal]);
  const sceneNotes = docVal.sceneNotes ?? {};
  const characterMeta = docVal.characterMeta ?? {};

  const pagination = useMemo(() => paginate(elements), [elements]);
  const scenes = useMemo(() => extractScenes(elements), [elements]);
  const charStats = useMemo(() => extractCharacterStats(elements), [elements]);
  const totalWords = useMemo(() => elements.reduce((a, e) => a + countWords(e.text), 0), [elements]);

  // ── Keskittymisistunnon ohjaus ────────────────────────────────────────────

  const enterFullscreen = () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch(() => { /* esim. iOS ei tue */ });
  };

  const startSession = () => {
    const mins = customMinutes.trim() !== '' ? parseInt(customMinutes, 10) : selMinutes;
    if (!mins || mins < 1 || Number.isNaN(mins)) { toast('Valitse kirjoitusaika', 'error'); return; }
    const secs = Math.min(mins, 600) * 60;
    setSessionSecs(secs);
    setRemaining(secs);
    setTimeUp(false);
    enterFullscreen();
    setPhase('entering');
    enterTimerRef.current = setTimeout(() => setPhase('writing'), 2700);
  };

  const quitSession = useCallback(() => {
    exitingRef.current = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ignore */ });
    router.push(`/${orgSlug}/kasikirjoitus`);
  }, [router, orgSlug]);

  const resumeSession = (extraSecs = 0) => {
    setShowExitConfirm(false);
    if (extraSecs > 0) {
      setSessionSecs(s => s + extraSecs);
      setRemaining(extraSecs);
      setTimeUp(false);
    }
    if (!document.fullscreenElement) enterFullscreen();
  };

  // Ajastin
  useEffect(() => {
    if (phase !== 'writing' || timeUp || showExitConfirm) return;
    const iv = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          setTimeUp(true);
          setShowExitConfirm(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, timeUp, showExitConfirm]);

  // Kokoruudusta poistuminen (Esc) → varmistus
  useEffect(() => {
    const onFs = () => {
      if (exitingRef.current) return;
      if (!document.fullscreenElement && (phase === 'writing' || phase === 'entering')) {
        setShowExitConfirm(true);
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [phase]);

  // Siivous: poistu kokoruudusta kun komponentti puretaan
  useEffect(() => () => {
    if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* ignore */ });
  }, []);

  // Kirjoitustilan alkaessa fokus viimeiseen elementtiin
  useEffect(() => {
    if (phase !== 'writing') return;
    const last = elements[elements.length - 1];
    if (last) {
      const ta = elRefs.current[last.id];
      if (ta) { ta.focus(); ta.setSelectionRange(last.text.length, last.text.length); }
    }
    // vain tilan vaihtuessa — ei joka muutoksella
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Datamutaatiot ─────────────────────────────────────────────────────────

  const mutateDoc = useCallback((fn: (d: ScreenplayDoc) => ScreenplayDoc) => {
    setDocVal(prev => fn({
      elements: prev.elements ?? [],
      sceneNotes: prev.sceneNotes ?? {},
      characterMeta: prev.characterMeta ?? {},
    }));
    // Päivitä indeksin updatedAt korkeintaan minuutin välein (vältetään turhat kirjoitukset)
    const now = Date.now();
    if (now - lastTouch.current > 60_000) {
      lastTouch.current = now;
      setIndex(prev => prev.map(s => s.id === scriptId ? { ...s, updatedAt: now } : s));
    }
  }, [setDocVal, setIndex, scriptId]);

  const updateMeta = useCallback((patch: Partial<ScreenplayMeta>) => {
    setIndex(prev => prev.map(s => s.id === scriptId ? { ...s, ...patch, updatedAt: Date.now() } : s));
  }, [setIndex, scriptId]);

  // Sivu- ja kohtausmäärän välimuisti listanäkymää varten
  useEffect(() => {
    if (!meta || !canEdit) return;
    if (meta.pageCount === pagination.pageCount && meta.sceneCount === scenes.length) return;
    setIndex(prev => prev.map(s =>
      s.id === scriptId ? { ...s, pageCount: pagination.pageCount, sceneCount: scenes.length } : s
    ));
  }, [pagination.pageCount, scenes.length, meta, canEdit, scriptId, setIndex]);

  // ── Fokus ja korkeudet ────────────────────────────────────────────────────

  useEffect(() => {
    if (pendingFocus.current) {
      const { id, pos } = pendingFocus.current;
      const ta = elRefs.current[id];
      if (ta) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
        pendingFocus.current = null;
      }
    }
    for (const id of Object.keys(elRefs.current)) {
      const ta = elRefs.current[id];
      if (ta) autoResize(ta);
    }
  }, [elements, phase]);

  const focusEl = (id: string, pos: number) => {
    const ta = elRefs.current[id];
    if (ta) { ta.focus(); ta.setSelectionRange(pos, pos); }
  };

  // ── Elementtioperaatiot ───────────────────────────────────────────────────

  const changeType = (id: string, type: ScreenplayElementType) => {
    mutateDoc(d => ({ ...d, elements: d.elements.map(x => x.id === id ? { ...x, type } : x) }));
  };

  const onChangeEl = (el: ScreenplayElement, text: string, ta: HTMLTextAreaElement) => {
    autoResize(ta);
    let type = el.type;
    if (el.type === 'action') {
      const auto = detectAutoType(text);
      if (auto) type = auto;
    }
    mutateDoc(d => ({ ...d, elements: d.elements.map(x => x.id === el.id ? { ...x, text, type } : x) }));
  };

  const appendElement = () => {
    if (!canEdit) return;
    const last = elements[elements.length - 1];
    if (last && last.text.trim() === '') { focusEl(last.id, last.text.length); return; }
    const newEl: ScreenplayElement = { id: newId('el'), type: 'action', text: '' };
    pendingFocus.current = { id: newEl.id, pos: 0 };
    mutateDoc(d => ({ ...d, elements: [...d.elements, newEl] }));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, el: ScreenplayElement, idx: number) => {
    if (!canEdit) return;
    const ta = e.currentTarget;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const caret = ta.selectionStart ?? el.text.length;
      const before = el.text.slice(0, caret);
      const after = el.text.slice(caret);
      // Rivin keskeltä katkaistaessa jatketaan samaa tyyppiä, lopusta siirrytään seuraavaan
      const newType = after ? el.type : NEXT_ON_ENTER[el.type];
      const newEl: ScreenplayElement = { id: newId('el'), type: newType, text: after };
      pendingFocus.current = { id: newEl.id, pos: 0 };
      mutateDoc(d => {
        const els = [...d.elements];
        const i = els.findIndex(x => x.id === el.id);
        if (i === -1) return d;
        els[i] = { ...els[i], text: before };
        els.splice(i + 1, 0, newEl);
        return { ...d, elements: els };
      });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      const ci = ELEMENT_TYPE_CYCLE.indexOf(el.type);
      changeType(el.id, ELEMENT_TYPE_CYCLE[(ci + dir + ELEMENT_TYPE_CYCLE.length) % ELEMENT_TYPE_CYCLE.length]);
    } else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0 && idx > 0) {
      e.preventDefault();
      const prevEl = elements[idx - 1];
      pendingFocus.current = { id: prevEl.id, pos: prevEl.text.length };
      mutateDoc(d => ({
        ...d,
        elements: d.elements
          .filter(x => x.id !== el.id)
          .map(x => x.id === prevEl.id ? { ...x, text: x.text + el.text } : x),
      }));
    } else if (e.key === 'ArrowUp' && ta.selectionStart === 0 && idx > 0) {
      e.preventDefault();
      const p = elements[idx - 1];
      focusEl(p.id, p.text.length);
    } else if (e.key === 'ArrowDown' && ta.selectionStart === el.text.length && idx < elements.length - 1) {
      e.preventDefault();
      focusEl(elements[idx + 1].id, 0);
    } else if (e.altKey && e.code && e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= ELEMENT_TYPE_CYCLE.length) {
        e.preventDefault();
        changeType(el.id, ELEMENT_TYPE_CYCLE[n - 1]);
      }
    }
  };

  // ── Versiot, PDF, Fountain ────────────────────────────────────────────────

  const saveVersion = () => {
    const name = versionName.trim() || `Luonnos ${versions.length + 1}`;
    const v: ScreenplayVersion = {
      id: newId('v'), name, colorId: versionColor, createdAt: Date.now(),
      pageCount: pagination.pageCount, elements: elements.map(e => ({ ...e })),
    };
    setVersions(prev => capVersions([...prev, v]));
    setVersionName('');
    toast('Versio tallennettu', 'success');
  };

  const restoreVersion = (v: ScreenplayVersion) => {
    if (typeof window !== 'undefined' &&
        !window.confirm(`Palautetaanko versio "${v.name}"? Nykyinen teksti korvataan.`)) return;
    mutateDoc(d => ({ ...d, elements: v.elements.map(e => ({ ...e })) }));
    toast('Versio palautettu', 'success');
  };

  const deleteVersion = (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Poistetaanko versio? Tätä ei voi perua.')) return;
    setVersions(prev => prev.filter(v => v.id !== id));
  };

  const exportPdf = () => {
    document.body.classList.add('sp-printing');
    const cleanup = () => document.body.classList.remove('sp-printing');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 2000);
  };

  const exportFountain = () => {
    if (!meta) return;
    const blob = new Blob([toFountain(meta, elements)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.title.replace(/[^\wäöåÄÖÅ -]/g, '')}.fountain`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const scrollToScene = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    const ta = elRefs.current[sceneId];
    if (ta) ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const fmtDateTime = (ts: number) =>
    new Date(ts).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Tumman tilan CSS-muuttujaylikirjoitukset — paneelin .input/.btn-tyylit
  // resolvautuvat näihin keskittymistilan sisällä
  const darkVars = {
    '--card': DARK.card, '--elev': DARK.elev, '--border': DARK.border,
    '--t1': DARK.t1, '--t2': DARK.t2, '--t3': DARK.t3, '--paper': DARK.bg,
  } as React.CSSProperties;

  // ── Tilat: lataus / ei löydy ──────────────────────────────────────────────

  if (indexLoading || docLoading) {
    return (
      <div className="sp-focus" style={{ ...darkVars, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: DARK.t3, fontFamily: 'var(--font-display)', letterSpacing: '.14em', textTransform: 'uppercase', fontSize: '.8rem', animation: 'spPulse 1.6s infinite' }}>
          Ladataan käsikirjoitusta…
        </span>
      </div>
    );
  }
  if (!meta || meta.deletedAt) {
    return (
      <div className="sp-focus" style={{ ...darkVars, display: 'flex', flexDirection: 'column', gap: '1.2rem', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: DARK.t2 }}>Käsikirjoitusta ei löytynyt.</div>
        <button className="sp-chip" onClick={() => router.push(`/${orgSlug}/kasikirjoitus`)}>← Takaisin listaan</button>
      </div>
    );
  }

  const focusedEl = elements.find(x => x.id === focusedId) || null;
  const selectedScene = scenes.find(s => s.id === selectedSceneId) || null;
  const timerFrac = sessionSecs > 0 ? remaining / sessionSecs : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="sp-focus" style={{ ...darkVars, overflowY: phase === 'writing' ? 'auto' : 'hidden' }}>

      {/* ── Setup: kirjoitusajan valinta ── */}
      {phase === 'setup' && (
        <div className="sp-setup-in" style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '1.4rem', padding: '2rem', textAlign: 'center',
        }}>
          <button
            onClick={quitSession}
            style={{
              position: 'fixed', top: 18, left: 18, background: 'transparent', border: 'none',
              color: DARK.t3, cursor: 'pointer', fontFamily: 'var(--font-display)',
              fontSize: '.74rem', letterSpacing: '.1em', textTransform: 'uppercase',
            }}
          >← Takaisin</button>

          <div style={{ fontFamily: 'var(--font-display)', fontSize: '.7rem', letterSpacing: '.3em', textTransform: 'uppercase', color: DARK.t3 }}>
            Käsikirjoitus
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? '1.6rem' : '2.4rem',
            textTransform: 'uppercase', letterSpacing: '.06em', color: DARK.t1, maxWidth: 720, lineHeight: 1.2,
          }}>
            {meta.title}
          </div>
          {/* Hetki-brändin 5-väriraita */}
          <div style={{ display: 'flex', width: 140, height: 3 }}>
            {BRAND_BAND.map(c => <span key={c} style={{ flex: 1, background: c }} />)}
          </div>

          <div style={{ color: DARK.t2, fontSize: '1rem', marginTop: '1.2rem' }}>
            Kuinka kauan aiot kirjoittaa?
          </div>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {PRESET_MINUTES.map(m => (
              <button
                key={m}
                className={`sp-chip ${customMinutes === '' && selMinutes === m ? 'act' : ''}`}
                onClick={() => { setSelMinutes(m); setCustomMinutes(''); }}
              >{m} min</button>
            ))}
            <input
              value={customMinutes}
              onChange={e => setCustomMinutes(e.target.value.replace(/\D/g, ''))}
              placeholder="oma"
              inputMode="numeric"
              className="sp-chip"
              style={{ width: 76, textAlign: 'center', outline: 'none', ...(customMinutes !== '' ? { borderColor: DARK.yellow, color: DARK.yellow } : {}) }}
            />
          </div>

          <button
            onClick={startSession}
            style={{
              marginTop: '1.6rem', background: DARK.t1, color: DARK.bg, border: 'none',
              fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '.92rem',
              letterSpacing: '.14em', textTransform: 'uppercase', padding: '1rem 3.2rem', cursor: 'pointer',
            }}
          >
            Aloita
          </button>
          <div style={{ color: DARK.dim, fontSize: '.74rem' }}>
            Kokoruututila käynnistyy — Esc kysyy ensin, haluatko varmasti lopettaa.
          </div>
        </div>
      )}

      {/* ── Sisäänmenoanimaatio ── */}
      {phase === 'entering' && (
        <div className="sp-enter">
          <div className="sp-enter-text">FADE IN:</div>
        </div>
      )}

      {/* ── Kirjoitustila ── */}
      {phase === 'writing' && (
        <>
          {/* Aika valuu sivussa */}
          <div style={{
            position: 'fixed', right: isMobile ? 12 : 30, top: '50%', transform: 'translateY(-50%)',
            zIndex: 84, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.7rem',
          }}>
            <div style={{ width: 2, height: isMobile ? 110 : 180, background: DARK.border, position: 'relative' }}>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, width: '100%',
                height: `${timerFrac * 100}%`,
                background: remaining <= 60 ? DARK.pink : DARK.yellow,
                transition: 'height 1s linear',
              }} />
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '.82rem', letterSpacing: '.08em',
              color: remaining <= 60 ? DARK.pink : DARK.t3,
              animation: timeUp ? 'spPulse 1.4s infinite' : undefined,
            }}>
              {fmtTimer(remaining)}
            </div>
          </div>

          {/* Tyyppivihje vasemmassa alakulmassa */}
          {focusedEl && !isMobile && (
            <div style={{
              position: 'fixed', left: 22, bottom: 18, zIndex: 84, color: DARK.dim,
              fontFamily: 'var(--font-display)', fontSize: '.66rem', letterSpacing: '.16em', textTransform: 'uppercase',
            }}>
              {ELEMENT_LABELS[focusedEl.type]} · Tab vaihtaa
            </div>
          )}

          {/* Lähes näkymätön työkaludokki (hover tuo esiin) */}
          <div className="sp-dock">
            <button className="sp-chip" style={{ padding: '.4rem .8rem', fontSize: '.68rem' }} onClick={exportPdf}>PDF</button>
            <button className="sp-chip" style={{ padding: '.4rem .8rem', fontSize: '.68rem' }} onClick={exportFountain}>Fountain</button>
            <button className="sp-chip" style={{ padding: '.4rem .8rem', fontSize: '.68rem' }} onClick={() => setPanelOpen(o => !o)}>
              {panelOpen ? 'Sulje paneeli' : 'Paneeli'}
            </button>
            <button className="sp-chip" style={{ padding: '.4rem .8rem', fontSize: '.68rem', borderColor: '#5a3038', color: DARK.pink }} onClick={() => setShowExitConfirm(true)}>
              Lopeta
            </button>
          </div>

          {/* Teksti — ei mitään muuta */}
          <div
            className="sp-writing-in"
            onClick={e => { if (e.target === e.currentTarget) appendElement(); }}
            style={{
              fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
              maxWidth: '62ch', margin: '0 auto', cursor: 'text', minHeight: '100%',
              padding: isMobile ? '12vh 1.2rem 50vh' : '14vh 1rem 50vh',
            }}
          >
            {elements.map((el, idx) => {
              const layout = ELEMENT_LAYOUT[el.type];
              return (
                <div
                  key={el.id}
                  style={{
                    marginTop: idx === 0 ? 0 : SCREEN_GAP[el.type],
                    marginLeft: isMobile ? 0 : `${layout.indent}ch`,
                    maxWidth: `${layout.width + 2}ch`,
                  }}
                >
                  <textarea
                    ref={ta => { elRefs.current[el.id] = ta; if (ta) autoResize(ta); }}
                    className="sp-el"
                    rows={1}
                    value={el.text}
                    readOnly={!canEdit}
                    placeholder={focusedId === el.id ? ELEMENT_LABELS[el.type] : ''}
                    onChange={e => onChangeEl(el, e.target.value, e.currentTarget)}
                    onKeyDown={e => onKeyDown(e, el, idx)}
                    onFocus={() => setFocusedId(el.id)}
                    style={{
                      textTransform: layout.upper ? 'uppercase' : 'none',
                      textAlign: layout.align === 'right' ? 'right' : 'left',
                      fontWeight: el.type === 'scene' ? 700 : 400,
                      color: el.type === 'scene' ? '#F4EFE6' : undefined,
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Sivupaneeli */}
          {panelOpen && (
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 86,
              width: isMobile ? '100%' : 340,
              background: DARK.card, borderLeft: `1px solid ${DARK.border}`,
              padding: '1.1rem', overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {([['kohtaukset', 'Kohtaukset'], ['hahmot', 'Hahmot'], ['versiot', 'Versiot'], ['tiedot', 'Tiedot']] as [PanelTab, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className="sp-chip"
                    style={{
                      padding: '.35rem .65rem', fontSize: '.66rem',
                      ...(tab === id ? { background: DARK.yellow, borderColor: DARK.yellow, color: DARK.bg } : {}),
                    }}
                  >{label}</button>
                ))}
                <button
                  onClick={() => setPanelOpen(false)}
                  style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: DARK.t3, cursor: 'pointer', fontSize: '1.1rem' }}
                >×</button>
              </div>

              {/* Kohtaukset */}
              {tab === 'kohtaukset' && (
                <div>
                  {scenes.length === 0 && <div style={{ color: DARK.t3, fontSize: '.82rem' }}>Ei vielä kohtauksia. Kirjoita kohtausotsikko, esim. INT. TOIMISTO – PÄIVÄ.</div>}
                  {scenes.map(sc => (
                    <div
                      key={sc.id}
                      onClick={() => scrollToScene(sc.id)}
                      style={{
                        display: 'flex', gap: '.5rem', alignItems: 'baseline', padding: '.45rem .5rem',
                        cursor: 'pointer',
                        background: selectedSceneId === sc.id ? 'rgba(241,180,52,.1)' : 'transparent',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', color: DARK.t3, minWidth: 20 }}>{sc.number}</span>
                      <span style={{
                        flex: 1, fontSize: '.78rem', color: DARK.t1,
                        fontFamily: "'Courier Prime','Courier New',monospace",
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{sc.heading}</span>
                      {sceneNotes[sc.id]?.trim() && <span title="Muistiinpano" style={{ color: DARK.yellow, fontSize: '.7rem' }}>●</span>}
                      <span style={{ fontSize: '.7rem', color: DARK.t3 }}>s.{pagination.pageOfElement[sc.id] ?? '–'}</span>
                    </div>
                  ))}
                  {selectedScene && (
                    <div style={{ marginTop: '1rem', borderTop: `1px solid ${DARK.border}`, paddingTop: '.75rem' }}>
                      <div style={{
                        fontFamily: 'var(--font-display)', fontSize: '.68rem', letterSpacing: '.1em',
                        textTransform: 'uppercase', color: DARK.t2, marginBottom: '.4rem',
                      }}>Muistiinpanot — kohtaus {selectedScene.number}</div>
                      <textarea
                        className="input textarea"
                        style={{ minHeight: 90, fontSize: '.82rem' }}
                        value={sceneNotes[selectedScene.id] || ''}
                        readOnly={!canEdit}
                        placeholder="Kohtauksen muistiinpanot…"
                        onChange={e => mutateDoc(d => ({
                          ...d, sceneNotes: { ...d.sceneNotes, [selectedScene.id]: e.target.value },
                        }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Hahmot */}
              {tab === 'hahmot' && (
                <div>
                  {charStats.length === 0 && <div style={{ color: DARK.t3, fontSize: '.82rem' }}>Hahmot ilmestyvät tähän, kun lisäät hahmo-elementin ja dialogia.</div>}
                  {charStats.map(c => (
                    <div key={c.name} style={{ marginBottom: '.4rem' }}>
                      <div
                        onClick={() => setSelectedChar(selectedChar === c.name ? null : c.name)}
                        style={{
                          padding: '.45rem .5rem', cursor: 'pointer',
                          background: selectedChar === c.name ? 'rgba(241,180,52,.1)' : 'transparent',
                        }}
                      >
                        <div style={{ fontFamily: "'Courier Prime','Courier New',monospace", fontSize: '.82rem', color: DARK.t1 }}>{c.name}</div>
                        <div style={{ fontSize: '.7rem', color: DARK.t3 }}>
                          {c.dialogueCount} repliikkiä · {c.wordCount} sanaa · {c.sceneCount} kohtausta
                        </div>
                      </div>
                      {selectedChar === c.name && (
                        <textarea
                          className="input textarea"
                          style={{ minHeight: 70, fontSize: '.8rem', marginTop: '.3rem' }}
                          value={characterMeta[c.name]?.description || ''}
                          readOnly={!canEdit}
                          placeholder="Hahmon kuvaus, tausta, kaari…"
                          onChange={e => mutateDoc(d => ({
                            ...d, characterMeta: { ...d.characterMeta, [c.name]: { description: e.target.value } },
                          }))}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Versiot */}
              {tab === 'versiot' && (
                <div>
                  {canEdit && (
                    <div style={{ marginBottom: '1rem' }}>
                      <input
                        className="input" placeholder={`Version nimi (esim. Luonnos ${versions.length + 1})`}
                        value={versionName} onChange={e => setVersionName(e.target.value)}
                        style={{ marginBottom: '.4rem', fontSize: '.82rem' }}
                      />
                      <div style={{ display: 'flex', gap: '.4rem' }}>
                        <select className="input" value={versionColor} onChange={e => setVersionColor(e.target.value)}
                          style={{ flex: 1, fontSize: '.78rem', padding: '.4rem .6rem' }}>
                          {REVISION_COLORS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <button className="sp-chip" style={{ padding: '.4rem .8rem', fontSize: '.7rem' }} onClick={saveVersion}>Tallenna</button>
                      </div>
                    </div>
                  )}
                  {versions.length === 0 && <div style={{ color: DARK.t3, fontSize: '.82rem' }}>Ei tallennettuja versioita. Tallenna snapshot ennen isoja muutoksia.</div>}
                  {[...versions].sort((a, b) => b.createdAt - a.createdAt).map(v => {
                    const color = REVISION_COLORS.find(c => c.id === v.colorId);
                    return (
                      <div key={v.id} style={{
                        display: 'flex', alignItems: 'center', gap: '.5rem',
                        padding: '.5rem', border: `1px solid ${DARK.border}`, marginBottom: '.4rem',
                      }}>
                        <span style={{
                          width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                          background: color?.css || '#fff', border: '1px solid rgba(0,0,0,.25)',
                        }} title={color?.label} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '.8rem', color: DARK.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                          <div style={{ fontSize: '.68rem', color: DARK.t3 }}>{fmtDateTime(v.createdAt)} · {v.pageCount} sivua</div>
                        </div>
                        {canEdit && (
                          <>
                            <button className="sp-chip" style={{ padding: '.25rem .45rem', fontSize: '.62rem' }} onClick={() => restoreVersion(v)}>Palauta</button>
                            <button className="sp-chip" style={{ padding: '.25rem .45rem', fontSize: '.62rem', color: DARK.pink }} onClick={() => deleteVersion(v.id)}>×</button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tiedot */}
              {tab === 'tiedot' && (
                <div>
                  <label style={{ fontSize: '.68rem', fontFamily: 'var(--font-display)', letterSpacing: '.1em', textTransform: 'uppercase', color: DARK.t2 }}>Työnimi</label>
                  <input className="input" value={meta.title} readOnly={!canEdit}
                    onChange={e => updateMeta({ title: e.target.value })}
                    style={{ margin: '.3rem 0 .8rem', fontSize: '.82rem' }} />
                  <label style={{ fontSize: '.68rem', fontFamily: 'var(--font-display)', letterSpacing: '.1em', textTransform: 'uppercase', color: DARK.t2 }}>Käsikirjoittaja</label>
                  <input className="input" value={meta.author} readOnly={!canEdit}
                    onChange={e => updateMeta({ author: e.target.value })}
                    style={{ margin: '.3rem 0 .8rem', fontSize: '.82rem' }} />
                  <label style={{ fontSize: '.68rem', fontFamily: 'var(--font-display)', letterSpacing: '.1em', textTransform: 'uppercase', color: DARK.t2 }}>Yhteystiedot (nimiölehdelle)</label>
                  <input className="input" value={meta.contact || ''} readOnly={!canEdit}
                    onChange={e => updateMeta({ contact: e.target.value })}
                    style={{ margin: '.3rem 0 .8rem', fontSize: '.82rem' }} />
                  <label style={{ fontSize: '.68rem', fontFamily: 'var(--font-display)', letterSpacing: '.1em', textTransform: 'uppercase', color: DARK.t2 }}>Logline</label>
                  <textarea className="input textarea" value={meta.logline || ''} readOnly={!canEdit}
                    onChange={e => updateMeta({ logline: e.target.value })}
                    style={{ margin: '.3rem 0 1rem', minHeight: 70, fontSize: '.82rem' }} />
                  <div style={{
                    borderTop: `1px solid ${DARK.border}`, paddingTop: '.75rem',
                    fontSize: '.78rem', color: DARK.t2, display: 'grid', gap: '.3rem',
                  }}>
                    <div>{pagination.pageCount} sivua (≈ {pagination.pageCount} min)</div>
                    <div>{scenes.length} kohtausta</div>
                    <div>{charStats.length} puhuvaa hahmoa</div>
                    <div>{totalWords} sanaa</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Poistumisvarmistus ── */}
      {showExitConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(10,9,7,.84)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        }}>
          <div style={{
            background: DARK.card, border: `1px solid ${DARK.border}`,
            padding: '2.2rem 2.4rem', maxWidth: 420, textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.1rem',
              textTransform: 'uppercase', letterSpacing: '.08em', color: DARK.t1, marginBottom: '.7rem',
            }}>
              {timeUp ? 'Aika täyttyi' : 'Haluatko varmasti lopettaa?'}
            </div>
            <div style={{ color: DARK.t2, fontSize: '.88rem', marginBottom: '1.6rem', lineHeight: 1.5 }}>
              {timeUp
                ? 'Hienoa työtä. Teksti on tallennettu — jatketaanko vielä?'
                : `Aikaa on jäljellä ${fmtTimer(remaining)}. Teksti on tallennettu automaattisesti.`}
            </div>
            <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => resumeSession(timeUp ? 15 * 60 : 0)}
                style={{
                  background: DARK.t1, color: DARK.bg, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '.78rem',
                  letterSpacing: '.1em', textTransform: 'uppercase', padding: '.8rem 1.6rem',
                }}
              >
                {timeUp ? '+15 minuuttia' : 'Jatka kirjoittamista'}
              </button>
              <button className="sp-chip" style={{ borderColor: '#5a3038', color: DARK.pink }} onClick={quitSession}>
                Lopeta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tulostusnäkymä (PDF-vienti) — portaali bodyyn, näkyy vain printissä */}
      {mounted && createPortal(
        <div className="sp-print">
          {/* Nimiölehti */}
          <div className="sp-page sp-titlepage">
            <div style={{ textTransform: 'uppercase', letterSpacing: '.25em' }}>{meta.title}</div>
            <div style={{ marginTop: '28pt' }}>Käsikirjoitus</div>
            {meta.author && <div style={{ marginTop: '14pt' }}>{meta.author}</div>}
            {meta.contact && (
              <div style={{ position: 'absolute', bottom: '25mm', left: '38mm', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
                {meta.contact}
              </div>
            )}
          </div>
          {/* Sivut */}
          {pagination.pages.map((page, i) => (
            <div className="sp-page" key={i}>
              {i > 0 && <div className="sp-pagenum">{i + 1}.</div>}
              {page.map((ln, j) => {
                if (ln.type === 'blank') return <div className="sp-line" key={j}>{' '}</div>;
                const layout = ELEMENT_LAYOUT[ln.type as ScreenplayElementType];
                return (
                  <div
                    className="sp-line"
                    key={j}
                    style={{
                      paddingLeft: `${layout.indent}ch`,
                      textAlign: layout.align === 'right' ? 'right' : 'left',
                    }}
                  >{ln.text || ' '}</div>
                );
              })}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
