'use client';

// AI-Hetki Studio — yleisnäkymä: studion tila (heartbeat Mac Miniltä),
// ohjaus (tauko, lähtökohdat) ja projektit. Studio kirjoittaa aihetki_studio- ja
// aihetki_projektit-avaimia, tämä näkymä kirjoittaa vain aihetki_ohjaus-avainta.

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  AI_ASKELEET, AI_ROOLIT, EMPTY_OHJAUS, aiId, askelIndeksi, askelNimi, studioElossa,
  type AiOhjaus, type AiProjektiMeta, type AiStudioTila,
} from '@/lib/aihetki-shared';

const card: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem',
};
const label: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t2)',
};

function aikaSitten(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'juuri nyt';
  if (d < 3_600_000) return `${Math.round(d / 60_000)} min sitten`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)} h sitten`;
  return new Date(ms).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
}

export function Eteneminen({ askel, koko = 8 }: { askel: AiProjektiMeta['askel']; koko?: number }) {
  const i = askelIndeksi(askel);
  const valmis = askel === 'valmis';
  const kesk = askel === 'keskeytetty';
  return (
    <div style={{ display: 'flex', gap: 3 }} title={askelNimi(askel)}>
      {AI_ASKELEET.map((a, idx) => (
        <span key={a.id} style={{
          width: koko, height: koko, borderRadius: 2,
          background: kesk ? 'var(--red)' : idx < i || valmis ? 'var(--pri)' : idx === i ? 'var(--accent)' : 'var(--border)',
          opacity: kesk ? .5 : 1,
        }} />
      ))}
    </div>
  );
}

export default function AiHetkiStudioSection() {
  const router = useRouter();
  const orgSlug = (useParams().orgSlug as string) || '';
  const { user, canEdit } = useAuth();
  const { toast } = useToast();

  const [tila] = useOrgData<AiStudioTila | null>('aihetki_studio', null);
  const [projektit] = useOrgData<AiProjektiMeta[]>('aihetki_projektit', []);
  const [ohjaus, setOhjaus] = useOrgData<AiOhjaus>('aihetki_ohjaus', EMPTY_OHJAUS);
  const [siemen, setSiemen] = useState('');

  const elossa = studioElossa(tila);
  const aktiiviset = useMemo(() => projektit.filter(p => p.askel !== 'valmis' && p.askel !== 'keskeytetty').sort((a, b) => b.paivitetty - a.paivitetty), [projektit]);
  const valmiit = useMemo(() => projektit.filter(p => p.askel === 'valmis' || p.askel === 'keskeytetty').sort((a, b) => b.paivitetty - a.paivitetty), [projektit]);

  const lisaaSiemen = () => {
    const t = siemen.trim();
    if (!t) return;
    setOhjaus(prev => ({
      ...prev,
      siemenet: [...(prev.siemenet ?? []), { id: aiId('siemen'), teksti: t, luotu: Date.now(), kirjoittaja: user?.displayName || user?.email || 'Anton' }],
    }));
    setSiemen('');
    toast('Lähtökohta annettu studiolle — seuraava projekti lähtee siitä', 'success');
  };
  const poistaSiemen = (id: string) => setOhjaus(prev => ({ ...prev, siemenet: (prev.siemenet ?? []).filter(s => s.id !== id) }));

  const tilaTeksti = !tila
    ? 'Studio ei ole vielä raportoinut'
    : !elossa ? `Studio ei vastaa (viimeisin syke ${aikaSitten(tila.syke)})`
    : ohjaus.tauko ? 'Tauolla — jatkaa kun tauko poistetaan'
    : tila.tila === 'odottaa' ? 'Odottaa (päivän kiintiö täynnä tai tauko projektien välissä)'
    : tila.tyoskentelee
      ? `${AI_ROOLIT[tila.tyoskentelee]?.nimi ?? tila.tyoskentelee} ${tila.tyonKuvaus ?? 'työskentelee'}`
      : 'Käynnissä';
  const tilaVari = !tila || !elossa ? 'var(--t3)' : ohjaus.tauko || tila.tila === 'odottaa' ? 'var(--yellow)' : 'var(--green)';

  const projektiKortti = (p: AiProjektiMeta) => (
    <div key={p.id} onClick={() => router.push(`/${orgSlug}/studio/${p.id}`)} style={{ ...card, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 500 }}>{p.otsikko || 'Kehityksessä…'}</div>
        <span style={{ ...label, whiteSpace: 'nowrap' }}>{askelNimi(p.askel)}</span>
      </div>
      {p.logline && <div style={{ fontStyle: 'italic', color: 'var(--t2)', fontSize: '.9rem' }}>{p.logline}</div>}
      <Eteneminen askel={p.askel} />
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--t2)' }}>
        {p.formaatti && <span>{p.formaatti}</span>}
        {p.genre && <span>{p.genre}</span>}
        {p.lukijaSuositus && <span>Lukija: {p.lukijaSuositus} {p.lukijaArvosana ?? ''}/10</span>}
        {p.paatos && <span>Päätös: {p.paatos}</span>}
        {p.screenplayId && <span>✑ käsikirjoitus</span>}
        <span style={{ marginLeft: 'auto' }}>${p.kustannusUsd.toFixed(2)} · {aikaSitten(p.paivitetty)}</span>
      </div>
      {p.huomio && <div style={{ fontSize: '.8rem', color: 'var(--red)' }}>{p.huomio}</div>}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* Studion tila */}
      <div style={{ ...card, display: 'grid', gap: '.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: tilaVari, boxShadow: elossa && !ohjaus.tauko ? `0 0 0 4px ${tilaVari}22` : 'none' }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{tilaTeksti}</div>
          {tila?.aktiivinenOtsikko && elossa && (
            <button className="btn btn-ghost btn-sm" onClick={() => tila.aktiivinenProjektiId && router.push(`/${orgSlug}/studio/${tila.aktiivinenProjektiId}`)}>
              {tila.aktiivinenOtsikko} →
            </button>
          )}
        </div>
        {tila && (
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.8rem', color: 'var(--t2)' }}>
            <span>Syke {aikaSitten(tila.syke)}</span>
            <span>Malli {tila.malli}</span>
            <span>Tänään {tila.projektejaTanaan} projektia · ${tila.kustannusTanaanUsd.toFixed(2)}</span>
            <span>Yhteensä ${tila.kustannusYhteensaUsd.toFixed(2)}</span>
            {tila.viimeisinVirhe && <span style={{ color: 'var(--red)' }}>Virhe: {tila.viimeisinVirhe}</span>}
          </div>
        )}
        {!tila && (
          <div style={{ fontSize: '.85rem', color: 'var(--t2)' }}>
            Kun elokuvastudio käynnistyy Mac Minillä (FIREBASE_ADMIN_KEY ja momentum.orgSlug = &quot;{orgSlug}&quot;), sen tila ja projektit ilmestyvät tähän.
          </div>
        )}
      </div>

      {/* Ohjaus */}
      {canEdit && (
        <div style={{ ...card, display: 'grid', gap: '.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={label}>Ohjaus</div>
            <button
              className={`btn btn-sm ${ohjaus.tauko ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setOhjaus(prev => ({ ...prev, tauko: !prev.tauko })); toast(ohjaus.tauko ? 'Studio jatkaa' : 'Studio pysähtyy nykyisen askeleen jälkeen', 'success'); }}
            >
              {ohjaus.tauko ? '▶ Jatka studiota' : '❚❚ Tauko'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start' }}>
            <textarea
              className="input textarea" placeholder="Anna studiolle lähtökohta seuraavaan projektiin — idea, teema, henkilö, tilanne…"
              value={siemen} onChange={e => setSiemen(e.target.value)} style={{ minHeight: 80 }}
            />
            <button className="btn btn-primary" onClick={lisaaSiemen} disabled={!siemen.trim()}>Anna</button>
          </div>
          {(ohjaus.siemenet ?? []).length > 0 && (
            <div style={{ display: 'grid', gap: '.4rem' }}>
              {(ohjaus.siemenet ?? []).map(s => {
                const kaytetty = tila?.kaytetytSiemenet?.includes(s.id);
                const projekti = projektit.find(p => p.siemenId === s.id);
                return (
                  <div key={s.id} style={{ display: 'flex', gap: '.75rem', alignItems: 'center', fontSize: '.85rem', padding: '.5rem .75rem', background: 'var(--elev)', borderRadius: 'var(--r)' }}>
                    <span style={{ flex: 1 }}>{s.teksti}</span>
                    {projekti ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/${orgSlug}/studio/${projekti.id}`)}>{projekti.otsikko || 'Kehityksessä'} →</button>
                    ) : (
                      <span style={{ ...label, fontSize: '.65rem' }}>{kaytetty ? 'käytössä' : 'odottaa'}</span>
                    )}
                    {!kaytetty && <button className="btn btn-ghost btn-sm" onClick={() => poistaSiemen(s.id)} title="Poista">×</button>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Projektit */}
      <div>
        <div style={{ ...label, marginBottom: '.75rem' }}>Työn alla</div>
        {aktiiviset.length === 0 ? (
          <div style={{ color: 'var(--t3)', fontSize: '.9rem' }}>Ei aktiivisia projekteja.</div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>{aktiiviset.map(projektiKortti)}</div>
        )}
      </div>
      {valmiit.length > 0 && (
        <div>
          <div style={{ ...label, marginBottom: '.75rem' }}>Valmiit ja arkistoidut</div>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>{valmiit.map(projektiKortti)}</div>
        </div>
      )}

      {/* Studion muisti */}
      {tila?.muisti && (
        <div style={card}>
          <div style={{ ...label, marginBottom: '.75rem' }}>Studion opit</div>
          <div style={{ fontSize: '.85rem', color: 'var(--t2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{tila.muisti.replace(/\*\*/g, '')}</div>
        </div>
      )}
    </div>
  );
}
