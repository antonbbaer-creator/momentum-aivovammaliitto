'use client';

// AI-Hetki projektinäkymä — agenttien keskustelu ketjuna, askelten eteneminen ja
// Antonin kommentit. Kommentit kirjoitetaan avaimeen aihetki_kommentit_{id};
// studio lukee ne ennen seuraavaa askelta ja merkitsee käsitellyiksi.

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  AI_ASKELEET, AI_ROOLIT, aiId, askelIndeksi, askelNimi,
  type AiKommentti, type AiProjekti, type AiViesti,
} from '@/lib/aihetki-shared';
import AiHetkiMarkdown from './AiHetkiMarkdown';
import { Eteneminen } from './AiHetkiStudioSection';

const label: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t2)',
};

function aika(ms: number): string {
  return new Date(ms).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Avatar({ kirjain, vari }: { kirjain: string; vari: string }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 17, background: vari, color: '#fff', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '.85rem',
    }}>{kirjain}</div>
  );
}

function ViestiKortti({ v, orgSlug }: { v: AiViesti; orgSlug: string }) {
  const [auki, setAuki] = useState(false);
  const r = AI_ROOLIT[v.rooli] ?? AI_ROOLIT.studio;
  const pitka = v.teksti.length > 1400;
  const teksti = pitka && !auki ? v.teksti.slice(0, 1400).replace(/\s+\S*$/, '') + ' …' : v.teksti;
  return (
    <div style={{ display: 'flex', gap: '.9rem' }}>
      <Avatar kirjain={r.kirjain} vari={r.vari} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '.35rem' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>{r.nimi}</span>
          <span style={{ ...label, fontSize: '.65rem' }}>{askelNimi(v.askel)}</span>
          <span style={{ fontSize: '.75rem', color: 'var(--t3)' }}>{aika(v.at)}</span>
          {typeof v.kustannusUsd === 'number' && <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>${v.kustannusUsd.toFixed(2)}</span>}
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem 1.25rem' }}>
          {v.otsikko && <div style={{ fontFamily: 'var(--font-display)', fontSize: '.95rem', marginBottom: '.6rem' }}>{v.otsikko}</div>}
          <AiHetkiMarkdown text={teksti} />
          {pitka && (
            <button className="btn btn-ghost btn-sm" onClick={() => setAuki(a => !a)} style={{ marginTop: '.25rem' }}>
              {auki ? 'Näytä vähemmän' : 'Näytä koko teksti'}
            </button>
          )}
          {v.liite?.tyyppi === 'kasikirjoitus' && (
            <a href={`/${orgSlug}/kasikirjoitus/${v.liite.screenplayId}`} className="btn btn-secondary btn-sm" style={{ marginTop: '.75rem', textDecoration: 'none' }}>
              ✑ {v.liite.nimi}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function KommenttiKortti({ k, kasitelty }: { k: AiKommentti; kasitelty: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '.9rem' }}>
      <Avatar kirjain={(k.kirjoittaja || 'A').slice(0, 1).toUpperCase()} vari="var(--hetki-black)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '.35rem' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>{k.kirjoittaja}</span>
          <span style={{ fontSize: '.75rem', color: 'var(--t3)' }}>{aika(k.at)}</span>
          <span style={{ ...label, fontSize: '.65rem', color: kasitelty ? 'var(--green)' : 'var(--yellow)' }}>
            {kasitelty ? '✓ agentit huomioineet' : 'odottaa studiota'}
          </span>
        </div>
        <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem 1.25rem', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '.92rem' }}>
          {k.teksti}
        </div>
      </div>
    </div>
  );
}

export default function AiHetkiProjektiSection() {
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const projektiId = (params.projektiId as string) || '';
  const { user, canEdit } = useAuth();
  const { toast } = useToast();

  const [projekti, , loading] = useOrgData<AiProjekti | null>(`aihetki_projekti_${projektiId}`, null);
  const [kommentit, setKommentit] = useOrgData<AiKommentti[]>(`aihetki_kommentit_${projektiId}`, []);
  const [teksti, setTeksti] = useState('');

  const ketju = useMemo(() => {
    const viestit = (projekti?.viestit ?? []).map(v => ({ t: 'v' as const, at: v.at, v }));
    const koms = kommentit.map(k => ({ t: 'k' as const, at: k.at, k }));
    return [...viestit, ...koms].sort((a, b) => a.at - b.at);
  }, [projekti, kommentit]);

  const laheta = () => {
    const t = teksti.trim();
    if (!t) return;
    const k: AiKommentti = { id: aiId('kom'), at: Date.now(), kirjoittaja: user?.displayName || user?.email || 'Anton', uid: user?.uid, teksti: t };
    setKommentit(prev => [...prev, k]);
    setTeksti('');
    toast('Kommentti lähetetty — studio lukee sen ennen seuraavaa askelta', 'success');
  };

  if (loading) return <div style={{ color: 'var(--t3)' }}>Ladataan…</div>;
  if (!projekti) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/${orgSlug}/studio`)}>← Studio</button>
        <div style={{ color: 'var(--t3)', marginTop: '1rem' }}>Projektia ei löydy (studio ei ole vielä julkaissut sitä).</div>
      </div>
    );
  }

  const m = projekti.meta;
  const nyt = askelIndeksi(m.askel);
  const valmis = m.askel === 'valmis' || m.askel === 'keskeytetty';
  const kasitellyt = new Set(projekti.kasitellytKommentit ?? []);

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 900 }}>
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/${orgSlug}/studio`)}>← Studio</button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', margin: '.5rem 0 .25rem', fontWeight: 500 }}>{m.otsikko || 'Kehityksessä…'}</h1>
        {m.logline && <div style={{ fontStyle: 'italic', color: 'var(--t2)' }}>{m.logline}</div>}
        {m.tagline && <div style={{ color: 'var(--t2)', marginTop: '.25rem' }}>{m.tagline}</div>}
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '.8rem', color: 'var(--t2)', marginTop: '.6rem' }}>
          {m.formaatti && <span>{m.formaatti}</span>}
          {m.genre && <span>{m.genre}</span>}
          {m.lukijaSuositus && <span>Lukija: {m.lukijaSuositus} {m.lukijaArvosana ?? ''}/10</span>}
          {m.paatos && <span>Päätös: {m.paatos}</span>}
          <span>${m.kustannusUsd.toFixed(2)}</span>
          {m.screenplayId && <a href={`/${orgSlug}/kasikirjoitus/${m.screenplayId}`} style={{ color: 'var(--pri)' }}>✑ Avaa käsikirjoitus</a>}
        </div>
        {m.huomio && <div style={{ fontSize: '.85rem', color: 'var(--red)', marginTop: '.5rem' }}>{m.huomio}</div>}
      </div>

      {/* Askeleet */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', alignItems: 'center' }}>
        {AI_ASKELEET.map((a, i) => (
          <span key={a.id} style={{
            fontFamily: 'var(--font-display)', fontSize: '.62rem', letterSpacing: '.06em', textTransform: 'uppercase',
            padding: '.3rem .55rem', borderRadius: 'var(--r)',
            background: i < nyt || m.askel === 'valmis' ? 'var(--pri)' : i === nyt && !valmis ? 'var(--accent)' : 'var(--elev)',
            color: i <= nyt || m.askel === 'valmis' ? '#fff' : 'var(--t3)',
            border: '1px solid var(--border)',
          }}>{a.lyhyt}</span>
        ))}
        <span style={{ marginLeft: '.5rem' }}><Eteneminen askel={m.askel} koko={6} /></span>
      </div>

      {/* Ketju */}
      <div style={{ display: 'grid', gap: '1.25rem' }}>
        {ketju.length === 0 && <div style={{ color: 'var(--t3)' }}>Ei vielä puheenvuoroja.</div>}
        {ketju.map(item => item.t === 'v'
          ? <ViestiKortti key={item.v.id} v={item.v} orgSlug={orgSlug} />
          : <KommenttiKortti key={item.k.id} k={item.k} kasitelty={kasitellyt.has(item.k.id)} />
        )}
      </div>

      {/* Kommentointi */}
      {canEdit && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', display: 'grid', gap: '.6rem' }}>
          <div style={label}>{valmis ? 'Projekti on päättynyt — kommentit jäävät ketjuun, mutta agentit eivät enää lue niitä' : `Kommentoi — agentit lukevat tämän ennen askelta "${askelNimi(m.askel)}"`}</div>
          <textarea
            className="input textarea" placeholder="Mitä haluat sanoa tiimille? Suunta, huomio, kysymys, vaatimus…"
            value={teksti} onChange={e => setTeksti(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) laheta(); }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={laheta} disabled={!teksti.trim()}>Lähetä kommentti</button>
          </div>
        </div>
      )}
    </div>
  );
}
