'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useIntegrations, useIntegrationApi } from '@/lib/use-integrations';
import { useUserData } from '@/lib/use-user-data';
import {
  CalendarMeta,
  CalendarProvider,
  IntegrationDoc,
  getCalendarCategoryIds,
  isCalendarWriteFor,
} from '@/lib/integrations-shared';
import { PersonalCategory } from '@/lib/personal-shared';

const PROVIDER_LABEL: Record<CalendarProvider, string> = {
  google: 'Google Calendar',
  microsoft: 'Microsoft / Outlook',
};

export default function PersonalIntegrationsSection() {
  const { user } = useAuth();
  const { google, microsoft, loading } = useIntegrations();
  const [categories] = useUserData<PersonalCategory[]>('categories', []);
  const api = useIntegrationApi();
  const [busy, setBusy] = useState<string | null>(null);

  // OAuth-redirect-virheen näyttö
  const [oauthMsg, setOauthMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_ok')) {
      setOauthMsg({ kind: 'ok', text: `Kalenteri yhdistetty: ${params.get('oauth_ok')}` });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('oauth_error')) {
      setOauthMsg({ kind: 'error', text: `Virhe: ${params.get('oauth_error')}` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const startOAuth = async (provider: CalendarProvider) => {
    if (!user) return;
    setBusy(`${provider}:connect`);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/oauth/${provider}/start`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'unknown' }));
        setOauthMsg({ kind: 'error', text: `OAuth-aloitus epäonnistui: ${err.error || res.status}` });
        return;
      }
      const { url } = await res.json() as { url: string };
      window.location.href = url;
    } catch (e) {
      setOauthMsg({ kind: 'error', text: `OAuth-aloitus epäonnistui: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  };

  const updateCalendars = async (provider: CalendarProvider, calendars: CalendarMeta[]) => {
    setBusy(`${provider}:save`);
    try { await api.updateCalendars(provider, calendars); }
    finally { setBusy(null); }
  };

  const disconnect = async (provider: CalendarProvider) => {
    if (!confirm(`Poistetaanko ${PROVIDER_LABEL[provider]}-yhteys?`)) return;
    setBusy(`${provider}:disconnect`);
    try { await api.disconnect(provider); }
    finally { setBusy(null); }
  };

  const pollNow = async () => {
    setBusy('poll');
    try { await api.pollNow(); setOauthMsg({ kind: 'ok', text: 'P\u00e4ivitetty' }); }
    catch (e) { setOauthMsg({ kind: 'error', text: String(e) }); }
    finally { setBusy(null); }
  };

  return (
    <div style={{ padding: '0 36px 60px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
            Kalenterit
          </h2>
          {(google || microsoft) && (
            <button onClick={pollNow} disabled={busy === 'poll'} style={btnSecondary}>
              {busy === 'poll' ? 'P\u00e4ivitet\u00e4\u00e4n\u2026' : 'P\u00e4ivit\u00e4 nyt'}
            </button>
          )}
        </div>
        <p style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 0, marginBottom: 14 }}>
          Liit\u00e4 Google- ja Microsoft-kalenterit jotta ulkoiset tapahtumat n\u00e4kyv\u00e4t viikkokalenterissasi. Kategoriaan mapatut kalenterit synkronoivat my\u00f6s sinne lis\u00e4tyt aikalohkot.
        </p>

        {oauthMsg && (
          <div style={{
            padding: '8px 12px', marginBottom: 14, fontSize: 12,
            background: oauthMsg.kind === 'ok' ? 'rgba(42,138,134,.1)' : 'rgba(228,92,129,.1)',
            border: `1px solid ${oauthMsg.kind === 'ok' ? '#2a8a86' : '#e45c81'}`,
            color: oauthMsg.kind === 'ok' ? '#185e5b' : '#e45c81',
          }}>
            {oauthMsg.text}
          </div>
        )}

        {(['google', 'microsoft'] as CalendarProvider[]).map(provider => {
          const integration = provider === 'google' ? google : microsoft;
          return (
            <ProviderBlock
              key={provider}
              provider={provider}
              integration={integration}
              categories={categories}
              loading={loading}
              busy={busy}
              onConnect={() => startOAuth(provider)}
              onDisconnect={() => disconnect(provider)}
              onSave={(cals) => updateCalendars(provider, cals)}
            />
          );
        })}
      </section>
    </div>
  );
}

function ProviderBlock({
  provider, integration, categories, loading, busy,
  onConnect, onDisconnect, onSave,
}: {
  provider: CalendarProvider;
  integration: IntegrationDoc | null;
  categories: PersonalCategory[];
  loading: boolean;
  busy: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSave: (cals: CalendarMeta[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CalendarMeta[] | null>(null);
  const cals = draft ?? integration?.calendars ?? [];

  const updateCal = (id: string, patch: Partial<CalendarMeta>) => {
    setDraft((cals).map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const toggleCategory = (id: string, categoryId: string) => {
    const cur = cals.find(c => c.id === id);
    if (!cur) return;
    const linked = new Set(getCalendarCategoryIds(cur));
    const writeFor = new Set(cur.writeForCategoryIds ?? []);
    if (linked.has(categoryId)) {
      linked.delete(categoryId);
      writeFor.delete(categoryId);
    } else {
      linked.add(categoryId);
    }
    updateCal(id, {
      mappedCategoryIds: Array.from(linked),
      mappedCategoryId: undefined, // siirry uuteen kenttään
      writeForCategoryIds: Array.from(writeFor),
    });
  };

  const toggleWriteFor = (id: string, categoryId: string) => {
    const cur = cals.find(c => c.id === id);
    if (!cur) return;
    const writeFor = new Set(cur.writeForCategoryIds ?? []);
    if (writeFor.has(categoryId)) writeFor.delete(categoryId);
    else writeFor.add(categoryId);
    updateCal(id, { writeForCategoryIds: Array.from(writeFor) });
  };

  const dirty = draft !== null;

  return (
    <div style={{ border: '1px solid var(--rule)', padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            {PROVIDER_LABEL[provider]}
          </div>
          {integration ? (
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
              {integration.email || 'Yhdistetty'}
              {integration.lastSyncAt && (
                <span> · viimeksi päivitetty {new Date(integration.lastSyncAt).toLocaleString('fi-FI')}</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>Ei yhdistetty</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!integration && !loading && (
            <button onClick={onConnect} style={btnPrimary}>Yhdist\u00e4</button>
          )}
          {integration && (
            <button onClick={onDisconnect} disabled={busy === `${provider}:disconnect`} style={btnDanger}>
              Poista yhteys
            </button>
          )}
        </div>
      </div>

      {integration && cals.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>
            Kalenterit
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cals.map(c => {
              const linkedCatIds = getCalendarCategoryIds(c);
              return (
              <div key={c.id} style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={c.syncEnabled}
                  onChange={e => updateCal(c.id, { syncEnabled: e.target.checked })}
                  aria-label="N\u00e4yt\u00e4 viikossa"
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>
                    {c.color && <span style={{ display: 'inline-block', width: 10, height: 10, background: c.color, marginRight: 6 }} />}
                    {c.name}
                    {c.isPrimary && <span style={{ fontSize: 10, color: 'var(--ink3)', marginLeft: 6 }}>(oletus)</span>}
                  </div>
                  {linkedCatIds.length > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>
                      {linkedCatIds.length} liitettyä aluetta
                    </div>
                  )}
                </div>
                </div>

                {categories.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--ink3)', paddingLeft: 24 }}>
                    Lisää ensin elämän alueita /oma/viikko-näkymässä.
                  </div>
                ) : (
                  <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)', display: 'grid', gridTemplateColumns: '20px 20px 1fr', gap: 8, alignItems: 'center', paddingBottom: 4 }}>
                      <span title="Liitä tämä alue tähän kalenteriin">Liitä</span>
                      <span title="Tämä kalenteri toimii alueen kirjoituskohteena">Kirj.</span>
                      <span>Alue</span>
                    </div>
                    {categories.map(cat => {
                      const linked = linkedCatIds.includes(cat.id);
                      const writeOn = isCalendarWriteFor(c, cat.id);
                      return (
                        <label
                          key={cat.id}
                          style={{ display: 'grid', gridTemplateColumns: '20px 20px 1fr', gap: 8, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={linked}
                            onChange={() => toggleCategory(c.id, cat.id)}
                            aria-label={`Liitä alue ${cat.name}`}
                          />
                          <input
                            type="checkbox"
                            checked={writeOn}
                            disabled={!linked}
                            onChange={() => toggleWriteFor(c.id, cat.id)}
                            aria-label={`Kirjoita kalenteriin alueelle ${cat.name}`}
                          />
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, background: cat.color }} />
                            {cat.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
          {dirty && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button
                onClick={async () => { await onSave(cals); setDraft(null); }}
                disabled={busy === `${provider}:save`}
                style={btnPrimary}
              >
                Tallenna
              </button>
              <button onClick={() => setDraft(null)} style={btnSecondary}>
                Peruuta
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputBase: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--rule)', padding: '4px 6px',
  fontFamily: 'var(--font-display)', color: 'var(--ink)',
};
const btnPrimary: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
  background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '8px 16px', cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
  background: 'transparent', color: 'var(--ink)', border: '1px solid var(--ink2)', padding: '8px 16px', cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
  background: 'transparent', color: '#e45c81', border: '1px solid #e45c81', padding: '8px 16px', cursor: 'pointer',
};
