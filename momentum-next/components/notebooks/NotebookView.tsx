'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import {
  ACCENTS, countWrittenPages, LEATHER, Notebook, NOTEBOOK_PAGES, NotebookPagesDoc,
  nowTs, pagesBodies,
} from '@/lib/notebooks-shared';
import PagePane from '@/components/notebooks/PagePane';
import DrawingPad from '@/components/notebooks/DrawingPad';
import { useAuth } from '@/lib/auth';
import { proofreadHtml, uploadNotebookImage } from '@/lib/notebook-media';

// Avoin muistikirja: kansi kääntyy auki animoidusti, sivut selataan
// aukeamina (vasen + oikea) sivunkääntöanimaatiolla. Kirjassa on
// kiinteät 50 sivua kuin oikeassa vihossa; aukeama 0 = sisäkansi + sivu 1.
// HUOM: vanhempi mountaa tämän key={notebook.id}:llä — hook-avainta
// ei saa vaihtaa paikallaan (use-user-data.ts tyhjentää debouncen).

interface Props {
  notebook: Notebook;
  onBack: () => void;
  onEditCover: () => void;
  onMeta: (patch: Partial<Notebook>) => void;
}

const EMPTY_PAGES: NotebookPagesDoc = {};
const MAX_SPREAD = NOTEBOOK_PAGES / 2; // aukeamat 0..25: [kansi|1], [2|3] ... [50|takakansi]
const TURN_MS = 520;

export default function NotebookView({ notebook, onBack, onEditCover, onMeta }: Props) {
  const [pagesDoc, setPagesDoc, loading] = useUserData<NotebookPagesDoc>(
    `notebookPages_${notebook.id}`,
    EMPTY_PAGES,
  );
  const [spread, setSpread] = useState(() =>
    Math.min(Math.max(notebook.lastSpread || 0, 0), MAX_SPREAD),
  );
  const [opening, setOpening] = useState(true);
  // Käännön aikana näytetään puoliksi vanhaa, puoliksi uutta aukeamaa:
  // fwd: vasen pysyy vanhana kunnes lehti laskeutuu sen päälle; oikea vaihtuu heti lehden alla.
  const [turning, setTurning] = useState<{ dir: 'fwd' | 'bwd'; prev: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixMsg, setFixMsg] = useState<string | null>(null);
  const [lastFix, setLastFix] = useState<{ pageNo: number; before: string } | null>(null);
  const { activeOrg } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const activeEd = useRef<{ el: HTMLElement; pageNo: number } | null>(null);
  const savedRange = useRef<Range | null>(null);

  // Koko näytön tila: lukitse taustan vieritys
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const bodies = pagesBodies(pagesDoc);
  const written = countWrittenPages(bodies);
  const leather = LEATHER[notebook.cover];
  const coverVars = {
    '--nb-hi': leather.hi,
    '--nb-base': leather.base,
    '--nb-lo': leather.lo,
    '--nb-ribbon-c': ACCENTS[notebook.ribbon].hex,
  } as React.CSSProperties;

  // Aukeaman sivunumerot: 0 = [sisäkansi | 1], s = [2s | 2s+1], 25 = [50 | takakansi]
  const pageNos = (s: number): [number | null, number | null] => {
    const left = s === 0 ? null : s * 2;
    const right = s * 2 + 1 > NOTEBOOK_PAGES ? null : s * 2 + 1;
    return [left, right];
  };
  const leftSpread = turning?.dir === 'fwd' ? turning.prev : spread;
  const rightSpread = turning?.dir === 'bwd' ? turning.prev : spread;
  const [leftNo] = pageNos(leftSpread);
  const [, rightNo] = pageNos(rightSpread);

  const updateBody = (pageNo: number, body: string) => {
    const next = { ...bodies };
    if (body) next[String(pageNo)] = body;
    else delete next[String(pageNo)];
    setPagesDoc({ bodies: next });
    onMeta({ updatedAt: nowTs(), pageCount: countWrittenPages(next) });
  };

  const goTo = (dir: 1 | -1) => {
    const next = spread + dir;
    if (turning || opening || next < 0 || next > MAX_SPREAD) return;
    activeEd.current = null;
    // Sisältö vaihtuu heti animaation alussa (ei React-työtä kesken käännön);
    // kääntyvä lehti peittää vaihtuvan puoliskon. Fallback-timeout siltä
    // varalta ettei animationend laukea (esim. mobiili, jossa lehti on piilossa).
    setTurning({ dir: dir === 1 ? 'fwd' : 'bwd', prev: spread });
    setSpread(next);
    setLastFix(null);
    window.setTimeout(() => setTurning(null), TURN_MS + 150);
    onMeta({ lastSpread: next });
  };

  // Nuolinäppäimet selaavat (kun fokus ei ole kirjoituskentässä); Esc sulkee koko näytön
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreen(false);
        return;
      }
      const ae = document.activeElement as HTMLElement | null;
      const tag = (ae?.tagName || '').toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select' || ae?.isContentEditable) return;
      if (e.key === 'ArrowRight') goTo(1);
      if (e.key === 'ArrowLeft') goTo(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onFocusEd = (el: HTMLElement, pageNo: number) => {
    activeEd.current = { el, pageNo };
    setLastFix((prev) => (prev && prev.pageNo !== pageNo ? null : prev));
  };

  const showFixMsg = (msg: string) => {
    setFixMsg(msg);
    window.setTimeout(() => setFixMsg(null), 4000);
  };

  /** Oikolukee fokusoidun sivun — korjaa vain kirjoitusvirheet. */
  const onProofread = async () => {
    if (!requirePage() || fixBusy) return;
    const a = activeEd.current!;
    const before = a.el.innerHTML;
    if (!before.replace(/<[^>]*>/g, '').trim()) {
      showFixMsg('Sivu on tyhjä.');
      return;
    }
    setFixBusy(true);
    try {
      const fixed = await proofreadHtml(before, activeOrg || '');
      if (!fixed) {
        showFixMsg('Oikoluku epäonnistui — yritä hetken päästä uudelleen.');
        return;
      }
      if (fixed === before) {
        showFixMsg('Ei korjattavia virheitä.');
        return;
      }
      // Jos käyttäjä ehti muokata sivua oikoluvun aikana, ei kirjoiteta päälle
      if (a.el.isConnected && a.el.innerHTML !== before) {
        showFixMsg('Sivu muuttui oikoluvun aikana — korjausta ei tehty.');
        return;
      }
      if (activeEd.current?.pageNo === a.pageNo && a.el.isConnected) {
        a.el.innerHTML = fixed;
      }
      updateBody(a.pageNo, fixed);
      setLastFix({ pageNo: a.pageNo, before });
      showFixMsg('Kirjoitusvirheet korjattu.');
    } finally {
      setFixBusy(false);
    }
  };

  const undoProofread = () => {
    if (!lastFix) return;
    const a = activeEd.current;
    if (a && a.pageNo === lastFix.pageNo && a.el.isConnected) {
      a.el.innerHTML = lastFix.before;
    }
    updateBody(lastFix.pageNo, lastFix.before);
    setLastFix(null);
    showFixMsg('Korjaus kumottu.');
  };

  /** Suorittaa muotoilukomennon fokusoidulla sivulla ja tallentaa tuloksen. */
  const exec = (command: string, value?: string) => {
    const a = activeEd.current;
    if (!a) return;
    a.el.focus();
    document.execCommand(command, false, value);
    updateBody(a.pageNo, a.el.innerHTML);
  };

  /** Otsikkotaso päälle/pois: sama taso uudestaan palauttaa leipätekstin. */
  const execBlock = (tag: 'h1' | 'h2') => {
    const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    exec('formatBlock', cur === tag ? '<div>' : `<${tag}>`);
  };

  /** Tallentaa kohdistimen sijainnin ennen tiedostodialogia / AI-pyyntöä. */
  const saveCaret = () => {
    const sel = window.getSelection();
    const a = activeEd.current;
    if (sel && sel.rangeCount > 0 && a && a.el.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    } else {
      savedRange.current = null;
    }
  };

  /** Liittää kuvan fokusoituun kohtaan sivulla. Piirrokset ilman valokuvakehystä. */
  const insertImageAt = (url: string, kind: 'photo' | 'drawing') => {
    const a = activeEd.current;
    if (!a) return;
    a.el.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (kind === 'drawing') {
      document.execCommand('insertHTML', false, `<img class="nbk-draw" src="${url}">`);
    } else {
      document.execCommand('insertImage', false, url);
    }
    updateBody(a.pageNo, a.el.innerHTML);
  };

  /** Varmistaa että jokin sivu on fokusoituna ennen kuvan/piirroksen lisäystä. */
  const requirePage = (): boolean => {
    if (activeEd.current) return true;
    window.alert('Klikkaa ensin sivua, johon lisäys tehdään.');
    return false;
  };

  const onPickImage = async (file: File) => {
    setImgBusy(true);
    try {
      const url = await uploadNotebookImage(file, activeOrg || '');
      if (url) insertImageAt(url, 'photo');
    } finally {
      setImgBusy(false);
    }
  };

  const onDrawSave = async (blob: Blob) => {
    setImgBusy(true);
    try {
      const file = new File([blob], 'piirros.png', { type: 'image/png' });
      const url = await uploadNotebookImage(file, activeOrg || '');
      if (url) insertImageAt(url, 'drawing');
    } finally {
      setImgBusy(false);
      setDrawOpen(false);
    }
  };

  const indicator =
    leftNo === null ? `Sivu 1 / ${NOTEBOOK_PAGES}`
    : rightNo === null ? `Sivu ${NOTEBOOK_PAGES} / ${NOTEBOOK_PAGES}`
    : `Sivut ${leftNo}–${rightNo} / ${NOTEBOOK_PAGES}`;

  const renderPane = (pageNo: number | null, side: 'l' | 'r') => {
    if (pageNo === null) {
      // Sisäkansi (etu tai taka) — nahkaa, nimikirjaimet embossattuna
      return (
        <div className={`nbk-page cov ${side}`} style={coverVars}>
          {notebook.initials ? <span className="nbk-cov-initials">{notebook.initials}</span> : null}
        </div>
      );
    }
    return (
      <PagePane
        key={pageNo}
        pageNo={pageNo}
        side={side}
        body={bodies[String(pageNo)] || ''}
        font={notebook.font}
        paper={notebook.paper}
        onChange={(body) => updateBody(pageNo, body)}
        onFocusEd={onFocusEd}
      />
    );
  };

  const toolbar = (
    <div className="nb-toolbar">
      <button className="nb-tool" title="Otsikko" onMouseDown={(e) => e.preventDefault()} onClick={() => execBlock('h1')}>Otsikko</button>
      <button className="nb-tool" title="Alaotsikko" onMouseDown={(e) => e.preventDefault()} onClick={() => execBlock('h2')}>Alaotsikko</button>
      <button className="nb-tool" title="Lihavoi (Cmd+B)" style={{ fontWeight: 700 }} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>L</button>
      <button className="nb-tool" title="Kursivoi (Cmd+I)" style={{ fontStyle: 'italic' }} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>K</button>
      <button className="nb-tool" title="Lista" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>Lista</button>
      <button className="nb-tool" title="Numeroitu lista" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}>1. Lista</button>
      <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 .35rem' }} />
      <button
        className="nb-tool"
        title="Lisää kuva sivulle"
        disabled={imgBusy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (requirePage()) { saveCaret(); fileRef.current?.click(); } }}
      >
        {imgBusy ? 'Ladataan…' : 'Kuva'}
      </button>
      <button
        className="nb-tool"
        title="Piirrä sivulle"
        disabled={imgBusy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (requirePage()) { saveCaret(); setDrawOpen(true); } }}
      >
        Piirrä
      </button>
      <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 .35rem' }} />
      <button
        className="nb-tool"
        title="Korjaa sivun kirjoitusvirheet — ei muuta muuten tekstiä"
        disabled={fixBusy}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onProofread}
      >
        {fixBusy ? 'Oikoluetaan…' : 'Oikolue'}
      </button>
      {lastFix && !fixBusy && (
        <button className="nb-tool" onMouseDown={(e) => e.preventDefault()} onClick={undoProofread}>
          Kumoa korjaus
        </button>
      )}
      {fixMsg && <span style={{ fontSize: '.7rem', color: 'var(--t3)', marginLeft: '.35rem' }}>{fixMsg}</span>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickImage(f);
          e.target.value = '';
        }}
      />
    </div>
  );

  const stage = loading ? (
    <div style={{ color: 'var(--t3)', fontSize: '.85rem', padding: '2rem 0' }}>Avataan muistikirjaa…</div>
  ) : (
    <div className="nbk-stage">
      <button className="nbk-edge" onClick={() => goTo(-1)} disabled={spread === 0 || opening} aria-label="Edellinen aukeama">‹</button>
      <div className={`nbk-book${opening ? ' opening' : ''}`}>
        <div className="nbk-half nbk-left">{renderPane(leftNo, 'l')}</div>
        <div className="nbk-half">{renderPane(rightNo, 'r')}</div>
        <div className="nbk-ribbon" style={coverVars} />
        {turning && <div className={`nbk-turn ${turning.dir}`} onAnimationEnd={() => setTurning(null)} />}
        {opening && (
          <div
            className="nbk-cover-open"
            style={coverVars}
            onAnimationEnd={() => setOpening(false)}
          >
            {notebook.label ? <span className="nbk-cov-label">{notebook.label}</span> : null}
          </div>
        )}
      </div>
      <button className="nbk-edge" onClick={() => goTo(1)} disabled={spread === MAX_SPREAD || opening} aria-label="Seuraava aukeama">›</button>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="nbk-fs">
        <div className="nbk-fs-top">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>Takaisin hyllyyn</button>
          <div>
            <div className="nbk-fs-title">{notebook.title || 'Nimetön'}</div>
            <div className="nbk-fs-sub">{indicator}</div>
          </div>
          <span style={{ flex: 1 }} />
          {toolbar}
          <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(false)}>Sulje</button>
        </div>
        {stage}
        {drawOpen && (
          <DrawingPad title="Piirrä sivulle" saveLabel="Lisää sivulle" busy={imgBusy} onSave={onDrawSave} onCancel={() => setDrawOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.9rem', flexWrap: 'wrap', marginBottom: '.9rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>Takaisin hyllyyn</button>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 500, letterSpacing: '.02em', color: 'var(--t1)' }}>
            {notebook.title || 'Nimetön'}
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.1rem' }}>
            {written === 1 ? '1 kirjoitettu sivu' : `${written} kirjoitettua sivua`} · {indicator}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setFullscreen(true)}>Koko näyttö</button>
        <button className="btn btn-secondary btn-sm" onClick={onEditCover}>Muokkaa kantta</button>
      </div>
      {toolbar}
      {stage}
      {drawOpen && (
        <DrawingPad title="Piirrä sivulle" saveLabel="Lisää sivulle" busy={imgBusy} onSave={onDrawSave} onCancel={() => setDrawOpen(false)} />
      )}
    </div>
  );
}
