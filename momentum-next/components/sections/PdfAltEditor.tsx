'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { enumerateFigures, applyRemediation } from '@/lib/pdf-figures';
import { renderFigureThumbnails } from '@/lib/pdf-render';
import { PdfFigure } from '@/lib/pdf-accessibility-shared';

export default function PdfAltEditor({
  taggedUrl, filename, onComplete, onCancel,
}: {
  taggedUrl: string;
  filename: string;
  onComplete: (finalBytes: Uint8Array, figures: PdfFigure[], title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [figures, setFigures] = useState<PdfFigure[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [title, setTitle] = useState(filename.replace(/\.pdf$/i, ''));
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const buf = new Uint8Array(await (await fetch(taggedUrl)).arrayBuffer());
        bytesRef.current = buf;
        const figs = await enumerateFigures(buf);
        if (cancelled) return;
        setFigures(figs);
        setLoading(false);
        const t = await renderFigureThumbnails(buf, figs);
        if (!cancelled) setThumbs(t);
      } catch (e) {
        if (!cancelled) { setErr(e instanceof Error ? e.message : String(e)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [taggedUrl]);

  const setFig = (id: string, patch: Partial<PdfFigure>) =>
    setFigures(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));

  async function suggestAlt(fig: PdfFigure): Promise<void> {
    const image = thumbs.get(fig.id);
    if (!image || !user) return;
    setSuggesting(prev => ({ ...prev, [fig.id]: true }));
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/pdf/alt-suggest', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: image, context: `Esite: ${title}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.decorative) setFig(fig.id, { decorative: true, alt: '' });
      else if (data.alt) setFig(fig.id, { alt: data.alt, decorative: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(prev => ({ ...prev, [fig.id]: false }));
    }
  }

  async function suggestAll(): Promise<void> {
    for (const f of figures) {
      if (!f.decorative && !f.alt.trim()) await suggestAlt(f);
    }
  }

  const missingAlt = figures.filter(f => !f.decorative && !f.alt.trim()).length;

  async function handleSave() {
    if (!bytesRef.current) return;
    setSaving(true);
    setErr(null);
    try {
      const finalBytes = await applyRemediation(bytesRef.current, {
        figures: figures.map(f => ({
          alt: f.decorative ? 'Koristekuva.' : f.alt.trim(),
          decorative: f.decorative,
        })),
        title: title.trim() || filename,
        lang: 'fi-FI',
      });
      await onComplete(finalBytes, figures, title.trim() || filename);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <strong style={{ color: 'var(--t1)' }}>Vaihtoehtoiset tekstit kuville</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          {!loading && figures.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={suggestAll}
              disabled={saving || Object.values(suggesting).some(Boolean)}
            >
              Ehdota kaikille (AI)
            </button>
          )}
          <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Sulje</button>
        </div>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>Dokumentin otsikko (näkyy ruudunlukijalle ja välilehdellä)</span>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} />
      </label>

      {loading && <p style={{ color: 'var(--t3)' }}>Luetaan kuvia esitteestä…</p>}
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}

      {!loading && figures.length === 0 && (
        <p style={{ color: 'var(--t3)' }}>Esitteestä ei löytynyt tagattuja kuvia.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {figures.map((f, i) => (
          <div key={f.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderTop: i ? '1px solid var(--border)' : 'none', paddingTop: i ? 12 : 0 }}>
            <div style={{ width: 130, flexShrink: 0 }}>
              {thumbs.get(f.id) ? (
                <img src={thumbs.get(f.id)} alt="" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ width: '100%', height: 80, background: 'var(--elev)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 12 }}>Sivu {f.page}</div>
              )}
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Kuva {i + 1} · sivu {f.page}</div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Kuvaile mitä kuvassa on (esim. Iäkäs nainen hymyilee ulkona)"
                value={f.alt}
                disabled={f.decorative}
                onChange={e => setFig(f.id, { alt: e.target.value })}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '2px 8px' }}
                  disabled={f.decorative || !thumbs.get(f.id) || !!suggesting[f.id]}
                  onClick={() => suggestAlt(f)}
                >
                  {suggesting[f.id] ? 'Ehdotetaan…' : 'Ehdota (AI)'}
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t2)' }}>
                  <input type="checkbox" checked={f.decorative} onChange={e => setFig(f.id, { decorative: e.target.checked })} />
                  Koristekuva (ei merkitystä sisällölle)
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && figures.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Tallennetaan…' : 'Valmista ja tallenna saavutettava PDF'}
          </button>
          {missingAlt > 0 && (
            <span style={{ fontSize: 13, color: 'var(--yellow)' }}>
              {missingAlt} kuvalta puuttuu vielä alt-teksti
            </span>
          )}
        </div>
      )}
    </div>
  );
}
