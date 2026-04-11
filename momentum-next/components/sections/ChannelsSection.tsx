'use client';

/*
 * Julkaisu-välilehti — kanavat + julkaisuvirta kanavittain.
 *
 * Näyttää kaikkien kanavien listan; jokaisen kanavan alla on ne julkaisut,
 * jotka on valmiita julkaistavaksi (status 'ready') tai jo julkaistu.
 * Kun viestinnäntekijä painaa "Julkaisen nyt", kanava merkitään julkaistuksi
 * (publishedChannels). Kun kaikki kanavat on julkaistu, pub siirtyy 'published'-
 * tilaan ja näkyy "Julkaistut" -osiossa.
 */

import { useMemo, useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import {
  Publication,
  normalizePublication,
  PLATFORM_META,
  sortByDeadline,
} from '@/lib/publications-shared';

const platformLinks: Record<string, string> = {
  Facebook: 'https://business.facebook.com/latest/home',
  Instagram: 'https://business.facebook.com/latest/home',
  LinkedIn: 'https://www.linkedin.com/company/',
  TikTok: 'https://www.tiktok.com/creator#/portal',
  YouTube: 'https://studio.youtube.com/',
};

interface Props {
  onOpenDetail?: (id: string) => void;
  onOpenEditor?: (pubId?: string) => void;
}

export default function ChannelsSection({ onOpenDetail, onOpenEditor }: Props) {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [org] = useOrgData<any>('org', { channels: [] });
  const [channelStats, setChannelStats] = useOrgData<any[]>('channelStats', []);
  const [rawPubs, setPubs] = useOrgData<any[]>('publications', []);
  const [selected, setSelected] = useState<string | null>(null);
  const [followers, setFollowers] = useState('');
  const [reach, setReach] = useState('');

  const channels: any[] = org.channels || [];
  const pubs: Publication[] = useMemo(
    () => (rawPubs || []).map(normalizePublication),
    [rawPubs]
  );

  // Yksittäinen julkaisu voi kuulua useaan kanavaan — laske kanavakohtaiset listat
  const byChannel = useMemo(() => {
    const out: Record<string, { ready: Publication[]; published: Publication[] }> = {};
    for (const ch of channels) out[ch.name] = { ready: [], published: [] };
    for (const p of pubs) {
      for (const chName of p.channels || []) {
        if (!out[chName]) out[chName] = { ready: [], published: [] };
        // "Julkaistu kanavalla" = publishedChannels sisältää tämän kanavan TAI pub on globaalisti 'published'
        const isPublishedOnThis =
          (p.publishedChannels || []).includes(chName) || p.status === 'published';
        if (isPublishedOnThis) out[chName].published.push(p);
        else if (p.status === 'ready') out[chName].ready.push(p);
      }
    }
    // Järjestä: valmiit deadlinen mukaan, julkaistut uusin ensin
    for (const k of Object.keys(out)) {
      out[k].ready.sort(sortByDeadline);
      out[k].published.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    return out;
  }, [pubs, channels]);

  const selectedCh = selected ? channels.find((c: any) => c.name === selected) : null;
  const selectedStats = selected ? channelStats.find((s: any) => s.name === selected) : null;
  const selectedLists = selected ? byChannel[selected] || { ready: [], published: [] } : null;

  const saveStats = () => {
    const existing = channelStats.find((s: any) => s.name === selected);
    const today = new Date().toISOString().slice(0, 10);
    if (existing) {
      setChannelStats(prev =>
        prev.map(s =>
          s.name === selected
            ? { ...s, followers: parseInt(followers) || 0, reach, lastUpdated: today }
            : s
        )
      );
    } else {
      setChannelStats(prev => [
        ...prev,
        { name: selected, followers: parseInt(followers) || 0, reach, lastUpdated: today },
      ]);
    }
    toast('Tilastot päivitetty', 'success');
  };

  // Merkitse julkaisu julkaistuksi yksittäisellä kanavalla.
  // Jos kaikki kanavat on merkitty, pub siirtyy globaalisti 'published'-tilaan.
  const markPublishedOnChannel = (pubId: string, chName: string) => {
    if (!canEdit) {
      toast('Vierailijat eivät voi julkaista', 'error');
      return;
    }
    setPubs(prev =>
      (prev || []).map(p => {
        if (p.id !== pubId) return p;
        const pubChannels: string[] = Array.isArray(p.channels) ? p.channels : [];
        const already: string[] = Array.isArray(p.publishedChannels) ? p.publishedChannels : [];
        if (already.includes(chName)) return p;
        const next = [...already, chName];
        const allDone = pubChannels.every(c => next.includes(c));
        return {
          ...p,
          publishedChannels: next,
          status: allDone ? 'published' : p.status,
          updatedAt: Date.now(),
        };
      })
    );
    toast(`Merkitty julkaistuksi · ${chName}`, 'success');
  };

  const revertPublishedOnChannel = (pubId: string, chName: string) => {
    if (!canEdit) return;
    setPubs(prev =>
      (prev || []).map(p => {
        if (p.id !== pubId) return p;
        const already: string[] = Array.isArray(p.publishedChannels) ? p.publishedChannels : [];
        const next = already.filter(c => c !== chName);
        return {
          ...p,
          publishedChannels: next,
          // jos pub oli julkaistu ja perumme yhden kanavan, palautetaan 'ready'
          status: p.status === 'published' ? 'ready' : p.status,
          updatedAt: Date.now(),
        };
      })
    );
  };

  // Laske kanavakohtaiset yhteenvetot listausta varten
  const counts = useMemo(() => {
    const out: Record<string, { ready: number; published: number }> = {};
    for (const ch of channels) {
      const lists = byChannel[ch.name] || { ready: [], published: [] };
      out[ch.name] = { ready: lists.ready.length, published: lists.published.length };
    }
    return out;
  }, [byChannel, channels]);

  // ================= DETAIL VIEW =================
  if (selectedCh && selectedLists) {
    const pm = PLATFORM_META[selectedCh.name];
    const brandColor = selectedCh.color || pm?.color || '#7b2cbf';

    return (
      <>
        <button
          className="btn btn-ghost"
          onClick={() => setSelected(null)}
          style={{ marginBottom: '1rem' }}
        >
          {'←'} Takaisin kanaviin
        </button>

        {/* Kanavan otsikko */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--rl)',
            padding: '1.5rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 'var(--r)',
                background: brandColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
              }}
            >
              {selectedCh.ic || pm?.ic || selectedCh.name[0]}
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedCh.name}</h3>
              <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: 2 }}>
                {selectedLists.ready.length} odottaa julkaisua · {selectedLists.published.length} julkaistu
              </div>
            </div>
            {(pm?.post || platformLinks[selectedCh.name]) && (
              <a
                href={pm?.post || platformLinks[selectedCh.name]}
                target="_blank"
                rel="noopener"
                className="btn btn-primary btn-sm"
              >
                Avaa {selectedCh.name} {'↗'}
              </a>
            )}
          </div>
        </div>

        {/* Tilastot (kompakti, jos löytyy) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '.75rem',
            marginBottom: '1.25rem',
          }}
        >
          <StatCard label="Seuraajat" value={selectedStats?.followers?.toLocaleString() || '-'} />
          <StatCard label="Tavoittavuus" value={selectedStats?.reach || '-'} />
          <StatCard label="Odottaa" value={String(selectedLists.ready.length)} accent={brandColor} />
          <StatCard label="Julkaistu" value={String(selectedLists.published.length)} />
        </div>

        {/* Odottavat julkaisut — ready-tilaiset tälle kanavalle */}
        <SectionBlock
          title="Odottaa julkaisua"
          count={selectedLists.ready.length}
          accent={brandColor}
          emptyText="Ei valmiita julkaisuja odottamassa — luo uusi Editorissa tai Tuotannossa."
        >
          {selectedLists.ready.map(p => (
            <PubRow
              key={p.id}
              pub={p}
              chName={selectedCh.name}
              mode="ready"
              canEdit={canEdit}
              onOpen={() => onOpenDetail?.(p.id)}
              onOpenEditor={() => onOpenEditor?.(p.id)}
              onPublish={() => markPublishedOnChannel(p.id, selectedCh.name)}
            />
          ))}
        </SectionBlock>

        {/* Julkaistut */}
        <SectionBlock
          title="Julkaistut"
          count={selectedLists.published.length}
          accent="var(--t3)"
          emptyText="Ei vielä julkaistuja tällä kanavalla."
        >
          {selectedLists.published.map(p => (
            <PubRow
              key={p.id}
              pub={p}
              chName={selectedCh.name}
              mode="published"
              canEdit={canEdit}
              onOpen={() => onOpenDetail?.(p.id)}
              onRevert={() => revertPublishedOnChannel(p.id, selectedCh.name)}
            />
          ))}
        </SectionBlock>

        {/* Tilastojen päivitys */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--rl)',
            padding: '1.25rem',
            marginTop: '1rem',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '.78rem',
              fontWeight: 600,
              marginBottom: '.6rem',
              textTransform: 'uppercase',
              letterSpacing: '.04em',
              color: 'var(--t2)',
            }}
          >
            Päivitä tilastot
          </h3>
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, marginBottom: 0, minWidth: 160 }}>
              <label>Seuraajat</label>
              <input
                className="input"
                type="number"
                value={followers}
                onChange={e => setFollowers(e.target.value)}
                placeholder={String(selectedStats?.followers || 0)}
              />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0, minWidth: 160 }}>
              <label>Tavoittavuus</label>
              <input
                className="input"
                value={reach}
                onChange={e => setReach(e.target.value)}
                placeholder={selectedStats?.reach || '0'}
              />
            </div>
            <button className="btn btn-primary" onClick={saveStats} disabled={!canEdit}>
              Tallenna
            </button>
          </div>
        </div>
      </>
    );
  }

  // ================= CHANNEL LIST =================
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '.85rem',
          flexWrap: 'wrap',
          gap: '.5rem',
        }}
      >
        <div style={{ fontSize: '.78rem', color: 'var(--t3)' }}>
          {channels.length} kanavaa · {pubs.filter(p => p.status === 'ready').length} odottaa
          julkaisua · {pubs.filter(p => p.status === 'published').length} julkaistu
        </div>
        {canEdit && onOpenEditor && (
          <button className="btn btn-secondary btn-sm" onClick={() => onOpenEditor()}>
            ◈ Avaa editori
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {channels.map((ch: any) => {
          const stats = channelStats.find((s: any) => s.name === ch.name);
          const c = counts[ch.name] || { ready: 0, published: 0 };
          const pm = PLATFORM_META[ch.name];
          const brandColor = ch.color || pm?.color || '#7b2cbf';

          return (
            <div
              key={ch.name}
              onClick={() => setSelected(ch.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem 1.25rem',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${brandColor}`,
                borderRadius: 'var(--rl)',
                cursor: 'pointer',
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--r)',
                  background: brandColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: '.85rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {ch.ic || pm?.ic || ch.name[0]}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.9rem', fontWeight: 600 }}>{ch.name}</div>
                <div
                  style={{
                    fontSize: '.7rem',
                    color: 'var(--t3)',
                    marginTop: 2,
                    display: 'flex',
                    gap: '.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  {c.ready > 0 && (
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                      ● {c.ready} odottaa
                    </span>
                  )}
                  {c.published > 0 && <span>{c.published} julkaistu</span>}
                  {c.ready === 0 && c.published === 0 && <span>Ei julkaisuja</span>}
                </div>
              </div>

              {stats && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.85rem', fontWeight: 700 }}>
                    {stats.followers?.toLocaleString() || '-'}
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--t3)' }}>seuraajaa</div>
                </div>
              )}

              {/* Odottavien pallero */}
              {c.ready > 0 && (
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: '0 .45rem',
                    borderRadius: 9999,
                    background: 'var(--green)',
                    color: '#0b1116',
                    fontSize: '.7rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={`${c.ready} valmista julkaisua odottaa`}
                >
                  {c.ready}
                </span>
              )}

              <span style={{ color: 'var(--t3)' }}>{'›'}</span>
            </div>
          );
        })}
        {channels.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
            Ei kanavia. Lisää ne Asetuksissa.
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: '1.5rem',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--rl)',
          padding: '1.25rem',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '.82rem',
            fontWeight: 500,
            marginBottom: '.75rem',
            textTransform: 'uppercase',
          }}
        >
          Pikayhteydet
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '.6rem',
          }}
        >
          {Object.entries(platformLinks).map(([name, url]) => (
            <a
              key={name}
              href={url}
              target="_blank"
              rel="noopener"
              className="btn btn-ghost"
              style={{
                textAlign: 'center',
                padding: '.75rem',
                textDecoration: 'none',
                display: 'block',
                fontSize: '.8rem',
              }}
            >
              {name} {'↗'}
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

// ======================== Small helpers ========================

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderTop: accent ? `3px solid ${accent}` : undefined,
        borderRadius: 'var(--rl)',
        padding: '1rem 1.1rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '.65rem',
          color: 'var(--t3)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          marginBottom: '.4rem',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
    </div>
  );
}

function SectionBlock({
  title,
  count,
  accent,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  accent: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderTop: `3px solid ${accent}`,
        borderRadius: 'var(--rl)',
        padding: '1rem 1.1rem',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '.75rem',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '.78rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.04em',
            color: 'var(--t2)',
          }}
        >
          {title}
        </h3>
        <span
          style={{
            fontSize: '.68rem',
            fontWeight: 700,
            padding: '.15rem .55rem',
            borderRadius: 9999,
            background: 'var(--elev)',
            color: 'var(--t2)',
          }}
        >
          {count}
        </span>
      </div>
      {count === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '1.2rem .5rem',
            color: 'var(--t3)',
            fontSize: '.78rem',
            fontStyle: 'italic',
          }}
        >
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>{children}</div>
      )}
    </div>
  );
}

function PubRow({
  pub,
  chName,
  mode,
  canEdit,
  onOpen,
  onOpenEditor,
  onPublish,
  onRevert,
}: {
  pub: Publication;
  chName: string;
  mode: 'ready' | 'published';
  canEdit: boolean;
  onOpen: () => void;
  onOpenEditor?: () => void;
  onPublish?: () => void;
  onRevert?: () => void;
}) {
  const pm = PLATFORM_META[chName];
  const postUrl = pm?.post;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '.75rem',
        padding: '.65rem .85rem',
        background: 'var(--elev)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
      }}
    >
      {/* Thumb */}
      <div
        onClick={onOpen}
        style={{
          width: 46,
          height: 46,
          flexShrink: 0,
          borderRadius: 6,
          background: pub.image
            ? `center/cover url("${pub.image}")`
            : 'var(--card)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
        }}
        title="Avaa julkaisun tiedot"
      />

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpen}>
        <div
          style={{
            fontSize: '.82rem',
            fontWeight: 600,
            color: 'var(--t1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {pub.title || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>(nimetön)</span>}
        </div>
        <div
          style={{
            fontSize: '.68rem',
            color: 'var(--t3)',
            display: 'flex',
            gap: '.5rem',
            marginTop: 2,
            flexWrap: 'wrap',
          }}
        >
          {pub.date && <span>Aika {pub.date}</span>}
          {pub.channels.length > 1 && (
            <span>
              · Yhteensä {pub.channels.length} kanava{pub.channels.length === 1 ? '' : 'a'}
            </span>
          )}
          {mode === 'published' && pub.publishedChannels?.includes(chName) && (
            <span style={{ color: 'var(--green)' }}>● Julkaistu</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '.35rem', flexShrink: 0 }}>
        {mode === 'ready' && canEdit && (
          <>
            {onOpenEditor && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={e => {
                  e.stopPropagation();
                  onOpenEditor();
                }}
                title="Muokkaa editorissa"
              >
                ◈
              </button>
            )}
            {postUrl && (
              <a
                href={postUrl}
                target="_blank"
                rel="noopener"
                className="btn btn-ghost btn-sm"
                onClick={e => e.stopPropagation()}
                title={`Avaa ${chName} julkaisuikkuna`}
              >
                ↗
              </a>
            )}
            {onPublish && (
              <button
                className="btn btn-primary btn-sm"
                onClick={e => {
                  e.stopPropagation();
                  onPublish();
                }}
                title={`Merkitse julkaistuksi · ${chName}`}
              >
                Julkaise
              </button>
            )}
          </>
        )}
        {mode === 'published' && canEdit && onRevert && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={e => {
              e.stopPropagation();
              onRevert();
            }}
            title="Peru merkintä"
          >
            Peru
          </button>
        )}
      </div>
    </div>
  );
}
