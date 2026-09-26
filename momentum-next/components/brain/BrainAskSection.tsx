'use client';

// Aivojen Kysy-näkymä: kysymys aivoille (/api/brain/ask), vastaus lähdeviitteineen.
// Vastauksen [1]-viitteet muutetaan linkeiksi lähteenä olevaan muistiinpanoon.
// Aiemmat kysymykset pidetään vain tämän istunnon ajan komponentin tilassa.

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/lib/toast';
import { brainApi, useBrainAccess, useBrainNotes } from '@/lib/use-brain';
import BrainMarkdown from './BrainMarkdown';
import { brainCard, brainLabel, noteHref, useBrainBase, useWikiResolver } from './BrainShell';

interface AskSource { slug: string; name: string; title: string; quote: string }
interface AskResult { found: boolean; answer: string; sources: AskSource[]; model?: string }
interface AskEntry { id: number; question: string; result: AskResult }

// Yleiset esimerkit, ei organisaatiokohtaista sisältöä
const EXAMPLES = [
  'Mitkä ovat arvomme?',
  'Mitä päätimme viimeksi?',
  'Mitkä asiat odottavat vahvistusta?',
  'Mikä on tämän vuoden tavoite?',
];

function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Kysymys epäonnistui. Yritä uudelleen.';
}

/**
 * Muuttaa vastauksen viitteet [1], [2] ja [1, 2] linkeiksi lähteen muistiinpanoon.
 * Linkin tekstiksi jää numero hakasulkeiden sisään (hakasulkeet escapetaan, jotta ne näkyvät).
 * Olemassa olevia markdown-linkkejä ([teksti](osoite)) ja koodia ei muuteta.
 */
function linkCitations(answer: string, sources: AskSource[], base: string): string {
  if (!sources.length) return answer;
  // Koodilohkot ja inline-koodi ohitetaan: jaetaan tekstiin ja koodiin
  const parts = answer.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.replace(/\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?![(\[])/g, (whole, nums: string) => {
      const items = nums.split(',').map(s => s.trim());
      if (!items.every(n => sources[Number(n) - 1])) return whole;
      const links = items.map(n => `[${n}](${noteHref(base, sources[Number(n) - 1].slug)})`);
      return `\\[${links.join(', ')}\\]`;
    });
  }).join('');
}

export default function BrainAskSection() {
  const { orgId } = useBrainAccess();
  const notes = useBrainNotes(orgId);
  const resolve = useWikiResolver(notes.data);
  const base = useBrainBase();
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<AskEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || !orgId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await brainApi<AskResult>('ask', { body: { orgId, question: text } });
      const id = nextId.current++;
      setHistory(h => [{ id, question: text, result: { ...result, sources: Array.isArray(result.sources) ? result.sources : [] } }, ...h]);
      setSelectedId(id);
      setQuestion('');
    } catch (e) {
      const m = errMsg(e);
      setError(m);
      toast(m, 'error');
    } finally {
      setBusy(false);
    }
  };

  const current = history.find(h => h.id === selectedId) || null;
  const earlier = history.filter(h => h.id !== selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
      <form onSubmit={e => { e.preventDefault(); void ask(question); }} style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label htmlFor="brain-ask-q" style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Kysy aivoilta</label>
        <textarea id="brain-ask-q" className="input" rows={3} value={question} maxLength={2000}
          aria-describedby="brain-ask-help"
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            // Enter lähettää, Shift+Enter tekee rivinvaihdon
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(question); }
          }}
          placeholder="Kirjoita kysymys omin sanoin…"
          style={{ width: '100%', fontSize: 17, lineHeight: 1.5, minHeight: 88 }} />
        <div id="brain-ask-help" style={{ fontSize: 13, color: 'var(--t3)' }}>
          Vastaus perustuu vain aivojen sisältöön. Enter lähettää, Shift + Enter vaihtaa riviä.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !question.trim() || !orgId} style={{ minHeight: 44 }}>
            {busy ? 'Etsitään…' : 'Kysy'}
          </button>
        </div>
        <div>
          <div style={brainLabel} id="brain-ask-examples">Esimerkkejä</div>
          <div role="group" aria-labelledby="brain-ask-examples" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {EXAMPLES.map(x => (
              <button key={x} type="button" className="btn btn-secondary btn-sm" disabled={busy || !orgId} style={{ minHeight: 44 }}
                onClick={() => { setQuestion(x); void ask(x); }}>
                {x}
              </button>
            ))}
          </div>
        </div>
      </form>

      <div aria-live="polite" role="status" style={{ fontSize: 15, color: 'var(--t2)' }}>
        {busy ? 'Etsitään aivoista… Tämä voi kestää hetken.' : ''}
      </div>

      {error && !busy && (
        <div role="alert" style={{ ...brainCard, borderColor: 'var(--red)', color: 'var(--t1)', fontSize: 14 }}>
          Kysymys epäonnistui: {error}
        </div>
      )}

      {current && (
        <section aria-labelledby="brain-ask-answer-h" style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={brainLabel}>Kysymys</div>
            <h2 id="brain-ask-answer-h" style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>{current.question}</h2>
          </div>
          {current.result.found ? (
            <>
              <div>
                <div style={brainLabel}>Vastaus</div>
                <div style={{ marginTop: 6 }}>
                  <BrainMarkdown source={linkCitations(current.result.answer, current.result.sources, base)} resolve={resolve} />
                </div>
              </div>
              {current.result.sources.length > 0 && (
                <div>
                  <div style={brainLabel}>Lähteet</div>
                  <ol style={{ margin: '6px 0 0', paddingLeft: '1.6em', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.5 }}>
                    {current.result.sources.map((s, i) => (
                      <li key={`${s.slug}-${i}`}>
                        <Link href={noteHref(base, s.slug)} style={{ color: 'var(--pri)', fontWeight: 600 }}>{s.title || s.name || s.slug}</Link>
                        {s.quote && <div style={{ color: 'var(--t2)', marginTop: 2 }}>&ldquo;{s.quote}&rdquo;</div>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Aivoista ei löytynyt vastausta tähän.</div>
              {current.result.answer && <div style={{ fontSize: 14, color: 'var(--t2)' }}>{current.result.answer}</div>}
              <div style={{ fontSize: 14 }}>
                Jos tiedät vastauksen, <Link href={`${base}/kirjaa`} style={{ color: 'var(--pri)' }}>kirjaa asia aivoihin</Link>, niin se löytyy ensi kerralla.
              </div>
            </div>
          )}
        </section>
      )}

      {earlier.length > 0 && (
        <section aria-labelledby="brain-ask-history-h">
          <div className="sec-h"><span className="t" id="brain-ask-history-h">Aiemmat kysymykset</span><span className="meta">Vain tämän käynnin ajan</span></div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {earlier.map(h => (
              <li key={h.id}>
                <button type="button" onClick={() => setSelectedId(h.id)}
                  style={{ width: '100%', textAlign: 'left', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', minHeight: 44, cursor: 'pointer', color: 'var(--t1)', fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{h.question}</span>
                  <span style={{ color: 'var(--t3)', marginLeft: 8, fontSize: 12 }}>{h.result.found ? `${h.result.sources.length} lähdettä` : 'Ei vastausta'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
