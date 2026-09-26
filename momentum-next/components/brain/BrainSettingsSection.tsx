'use client';

// Aivojen asetukset (omistajat ja ylläpitäjät): vienti Obsidian-vaultina, agenttitokenit,
// käyttöohje agenteille ja Sirille, muutoshistoria (audit-loki) ja tietosuojan tiivistelmä.

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/lib/toast';
import { brainApi, brainDownload, useBrainAccess, useBrainAudit } from '@/lib/use-brain';
import { AGENT_SCOPES, type AgentScope, type AgentTokenInfo, type BrainAuditEntry } from '@/lib/brain-shared';
import { brainCard, brainLabel, noteHref, useBrainBase } from './BrainShell';

const AGENT_URL = 'https://hetkimomentum.com/api/brain/agent';

const SCOPE_LABEL: Record<string, string> = Object.fromEntries(AGENT_SCOPES.map(s => [s.id, s.label]));

const ACTION_LABELS: Record<string, string> = {
  'note.create': 'Loi muistiinpanon',
  'note.update': 'Muokkasi',
  'inbox.create': 'Kirjasi',
  'inbox.apply': 'Hyväksyi kirjauksen',
  'inbox.suggest': 'Tekoäly ehdotti',
  'inbox.transcribe': 'Litteroi',
  'inbox.reject': 'Hylkäsi kirjauksen',
  'proposal.accept': 'Hyväksyi ehdotuksen',
  'proposal.reject': 'Hylkäsi ehdotuksen',
  'proposal.later': 'Siirsi myöhemmäksi',
  'proposal.create': 'Loi ehdotuksen',
  'decision.create': 'Kirjasi päätöksen',
  'token.create': 'Loi tokenin',
  'token.revoke': 'Perui tokenin',
  'agent.read': 'Agentti luki',
  'brain.export': 'Vei aivot',
  'brain.ask': 'Kysyi',
  'metric.create': 'Kirjasi toteuman',
  'goal.upsert': 'Päivitti tavoitteen',
};

const ENTITY_LABELS: Record<string, string> = {
  note: 'Muistiinpano',
  inbox: 'Kirjaus',
  proposal: 'Ehdotus',
  decision: 'Päätös',
  agentToken: 'Token',
  goal: 'Tavoite',
  org: 'Organisaatio',
  brain: 'Aivot',
};

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Jokin meni vikaan. Yritä uudelleen.';
}

function fmtTime(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function BrainSettingsSection() {
  const { canAdmin } = useBrainAccess();
  if (!canAdmin) {
    return <div style={{ ...brainCard, fontSize: 15, color: 'var(--t2)' }}>Asetukset ovat omistajien ja ylläpitäjien käytössä.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 980 }}>
      <ExportPanel />
      <TokensPanel />
      <AgentGuide />
      <AuditPanel />
      <PrivacyPanel />
    </div>
  );
}

function SectionHead({ id, title, meta }: { id: string; title: string; meta?: string }) {
  return (
    <div className="sec-h"><span className="t" id={id}>{title}</span>{meta && <span className="meta">{meta}</span>}</div>
  );
}

// ── Vienti ───────────────────────────────────────────────────────

function ExportPanel() {
  const { orgId } = useBrainAccess();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      await brainDownload('export', { orgId }, 'aivot.zip');
      toast('Lataus aloitettu.', 'success');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="bs-export-h">
      <SectionHead id="bs-export-h" title="Vienti" />
      <div style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--t2)' }}>
          Lataa aivot yhtenä zip-tiedostona. Pura se ja avaa kansio Obsidianissa, niin muistiinpanot ja linkit toimivat siellä sellaisenaan.
          Tiedosto toimii myös varmuuskopiona. Mukana on _momentum-kansio, jossa ovat tavoitteet, toteumat ja kirjaukset JSON-muodossa.
        </p>
        <div>
          <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={busy || !orgId} style={{ minHeight: 44 }}>
            {busy ? 'Valmistellaan latausta…' : 'Lataa aivot Obsidian-vaultina (zip)'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Agenttitokenit ───────────────────────────────────────────────

function TokensPanel() {
  const { orgId } = useBrainAccess();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<AgentTokenInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<AgentScope[]>(['read']);
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    // setState vain promisen callbackeissa
    brainApi<{ tokens: AgentTokenInfo[] }>('tokens', { query: { orgId } })
      .then(r => { if (alive) { setTokens(Array.isArray(r.tokens) ? r.tokens : []); setLoadError(null); } })
      .catch((e: unknown) => { if (alive) setLoadError(errMsg(e)); });
    return () => { alive = false; };
  }, [orgId, reload]);

  const toggleScope = (id: AgentScope, on: boolean) => {
    setScopes(s => (on ? (s.includes(id) ? s : [...s, id]) : s.filter(x => x !== id)));
  };

  const create = async () => {
    if (!orgId) return;
    if (!name.trim()) { toast('Anna tokenille nimi.', 'error'); return; }
    if (!scopes.length) { toast('Valitse vähintään yksi oikeus.', 'error'); return; }
    setBusy(true);
    try {
      const r = await brainApi<{ token: string; info: AgentTokenInfo }>('tokens', { body: { orgId, create: { name: name.trim(), scopes } } });
      setNewToken({ token: r.token, name: r.info.name });
      setCopied(false);
      setCreating(false);
      setName('');
      setScopes(['read']);
      setReload(n => n + 1);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (t: AgentTokenInfo) => {
    if (!orgId) return;
    if (!window.confirm(`Perutaanko token "${t.name}"? Sitä käyttävä agentti tai pikakomento lakkaa toimimasta heti. Tätä ei voi perua.`)) return;
    try {
      await brainApi('tokens', { body: { orgId, revoke: t.id } });
      toast('Token peruttu.', 'success');
      setReload(n => n + 1);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  const copy = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken.token);
      setCopied(true);
      toast('Token kopioitu leikepöydälle.', 'success');
    } catch {
      toast('Kopiointi ei onnistunut. Valitse teksti ja kopioi se käsin.', 'error');
    }
  };

  return (
    <section aria-labelledby="bs-tokens-h">
      <SectionHead id="bs-tokens-h" title="Agenttitokenit" meta="Avaimet agenteille ja pikakomennoille" />
      <div style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--t2)' }}>
          Token on salasanan kaltainen avain, jolla agentti tai iPhonen pikakomento pääsee aivoihin. Anna jokaiselle käyttäjälle oma token,
          jotta voit perua sen erikseen. Agentit eivät muuta muistiinpanoja suoraan: muutokset tulevat ehdotuksina hyväksyttäviksi.
        </p>

        {newToken && (
          <div role="alert" style={{ border: '2px solid var(--hetki-yellow)', borderRadius: 'var(--r)', padding: 14, background: 'var(--card2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Uusi token: {newToken.name}</div>
            <div style={{ fontSize: 14 }}>Tallenna tämä nyt. Sitä ei näytetä uudelleen.</div>
            <label htmlFor="bs-new-token" style={srOnly}>Uusi token</label>
            <input id="bs-new-token" className="input" readOnly value={newToken.token} onFocus={e => e.currentTarget.select()}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, width: '100%', minHeight: 44 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void copy()} style={{ minHeight: 44 }}>
                {copied ? 'Kopioitu' : 'Kopioi'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewToken(null)} style={{ minHeight: 44 }}>
                Olen tallentanut tokenin, sulje
              </button>
            </div>
          </div>
        )}

        {loadError && <div role="alert" style={{ color: 'var(--red)', fontSize: 14 }}>Tokenien lataus epäonnistui: {loadError}</div>}
        {!tokens && !loadError && <div role="status" style={{ color: 'var(--t3)', fontSize: 14 }}>Ladataan tokeneita…</div>}
        {tokens && tokens.length === 0 && <div style={{ color: 'var(--t2)', fontSize: 14 }}>Tokeneita ei ole vielä luotu.</div>}

        {tokens && tokens.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tokens.map(t => (
              <li key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', opacity: t.revokedAt ? 0.75 : 1 }}>
                <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {t.name}
                    {t.revokedAt
                      ? <span style={{ fontSize: 11, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 'var(--r)', padding: '0 6px' }}>Peruttu {fmtTime(t.revokedAt)}</span>
                      : <span style={{ fontSize: 11, color: 'var(--green)', border: '1px solid var(--green)', borderRadius: 'var(--r)', padding: '0 6px' }}>Voimassa</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--t2)' }}>Oikeudet: {t.scopes.map(s => SCOPE_LABEL[s] || s).join(', ') || 'ei oikeuksia'}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                    Luotu {fmtTime(t.createdAt)}{t.createdBy ? `, luoja ${t.createdBy}` : ''} · {t.lastUsedAt ? `Viimeksi käytetty ${fmtTime(t.lastUsedAt)}` : 'Ei vielä käytetty'}
                  </div>
                </div>
                {!t.revokedAt && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void revoke(t)} style={{ minHeight: 44 }}
                    aria-label={`Peru token ${t.name}`}>
                    Peru
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!creating ? (
          <div>
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(true)} style={{ minHeight: 44 }}>Luo uusi token</button>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void create(); }} aria-label="Uusi token"
            style={{ border: '1px solid var(--border-l)', borderRadius: 'var(--r)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="bs-token-name" style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>Nimi (kuka tai mikä käyttää tokenia)</label>
              <input id="bs-token-name" className="input" value={name} onChange={e => setName(e.target.value)} maxLength={100} required
                placeholder="esim. Strategia-agentti tai oma iPhone" style={{ minHeight: 44 }} />
            </div>
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <legend style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>Oikeudet</legend>
              {AGENT_SCOPES.map(s => (
                <label key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" checked={scopes.includes(s.id)} onChange={e => toggleScope(s.id, e.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
                  <span><strong>{s.label}</strong><br /><span style={{ color: 'var(--t2)', fontSize: 13 }}>{s.detail}</span></span>
                </label>
              ))}
            </fieldset>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy} style={{ minHeight: 44 }}>{busy ? 'Luodaan…' : 'Luo token'}</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setCreating(false)} style={{ minHeight: 44 }}>Peruuta</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

// ── Käyttöohje agenteille ja Sirille ─────────────────────────────

const CURL_READ = `curl -H "Authorization: Bearer <TOKEN>" \\
  "${AGENT_URL}?resource=search&q=tavoitteet"`;

const CURL_INBOX = `curl -X POST "${AGENT_URL}" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"inbox","text":"Tapaaminen siirtyi ensi viikolle."}'`;

const CURL_PROPOSAL = `curl -X POST "${AGENT_URL}" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "proposal",
    "title": "Lisää uusi toimintatapa",
    "bodyMd": "Miksi muutos kannattaa tehdä.",
    "area": "Toimintatavat",
    "impact": "keskisuuri",
    "urgency": "ei kiireellinen",
    "sources": ["https://esimerkki.fi/lahde"],
    "operation": {
      "type": "append_to_note",
      "targetSlug": "<muistiinpanon-slug>",
      "heading": "Toimintatavat",
      "content": "- Uusi toimintatapa",
      "reason": "Perustelu lyhyesti"
    }
  }'`;

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <pre tabIndex={0} aria-label={label}
      style={{ margin: 0, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 12px', overflowX: 'auto', fontSize: 12.5, lineHeight: 1.5 }}>
      <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{code}</code>
    </pre>
  );
}

function AgentGuide() {
  return (
    <section aria-labelledby="bs-guide-h">
      <SectionHead id="bs-guide-h" title="Käyttöohje agenteille ja Sirille" />
      <div style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14, lineHeight: 1.6 }}>
        <div>
          <div style={brainLabel}>Osoite</div>
          <code style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{AGENT_URL}</code>
          <div style={{ color: 'var(--t2)' }}>
            Jokaisessa kutsussa on otsake <code>Authorization: Bearer &lt;TOKEN&gt;</code>. Korvaa &lt;TOKEN&gt; yllä luodulla tokenilla.
            Lukeminen: <code>?resource=sections</code>, <code>notes</code>, <code>note&amp;slug=…</code>, <code>search&amp;q=…</code>, <code>goals</code>, <code>proposals</code> tai <code>decisions</code>.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontWeight: 600 }}>1. Hae aivoista (oikeus: Lukeminen)</div>
          <CodeBlock code={CURL_READ} label="Esimerkki: haku" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontWeight: 600 }}>2. Tee kirjaus (oikeus: Kirjaukset)</div>
          <CodeBlock code={CURL_INBOX} label="Esimerkki: kirjaus" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontWeight: 600 }}>3. Ehdota muutosta muistiinpanoon (oikeus: Ehdotukset)</div>
          <CodeBlock code={CURL_PROPOSAL} label="Esimerkki: ehdotus muutoksella" />
          <div style={{ color: 'var(--t2)' }}>Ehdotus menee Ehdotukset-sivulle. Muutos kirjoitetaan muistiinpanoon vasta, kun joku hyväksyy sen.</div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>iPhone: kirjaa puheella Sirin kautta</div>
          <div style={{ color: 'var(--t2)', marginBottom: 6 }}>Luo ensin token, jolla on oikeus Kirjaukset. Tee sitten Pikakomennot-apissa uusi pikakomento:</div>
          <ol style={{ margin: 0, paddingLeft: '1.4em', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Avaa Pikakomennot ja lisää uusi pikakomento. Anna sille nimi, esimerkiksi &quot;Kirjaa aivoihin&quot;. Sirille sanotaan tämä nimi.</li>
            <li>Lisää toiminto <strong>Sanele teksti</strong>.</li>
            <li>
              Lisää toiminto <strong>Hae URL:n sisältö</strong>. Aseta:
              <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
                <li>URL: <code style={{ overflowWrap: 'anywhere' }}>{AGENT_URL}</code></li>
                <li>Menetelmä: <strong>POST</strong></li>
                <li>Otsakkeet: avain <code>Authorization</code>, arvo <code>Bearer &lt;TOKEN&gt;</code></li>
                <li>Pyynnön runko: <strong>JSON</strong>, kentät <code>type</code> = <code>inbox</code>, <code>channel</code> = <code>siri</code> ja <code>text</code> = muuttuja <strong>Sanottu teksti</strong></li>
              </ul>
            </li>
            <li>Lisää toiminto <strong>Näytä ilmoitus</strong>, esimerkiksi tekstillä &quot;Kirjattu aivoihin&quot;.</li>
            <li>Kokeile: sano &quot;Hei Siri, kirjaa aivoihin&quot; ja sanele asia. Kirjaus näkyy Kirjaa-sivulla käsiteltävänä.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

// ── Muutoshistoria ───────────────────────────────────────────────

function AuditPanel() {
  const { orgId, canAdmin } = useBrainAccess();
  const audit = useBrainAudit(orgId, canAdmin);
  const base = useBrainBase();
  const [onlyAgents, setOnlyAgents] = useState(false);

  const rows = useMemo(() => (onlyAgents ? audit.data.filter(a => a.actorType === 'agent') : audit.data), [audit.data, onlyAgents]);

  const target = (a: BrainAuditEntry): React.ReactNode => {
    const ent = ENTITY_LABELS[a.entity] || a.entity;
    if (a.entity === 'note' && a.entityId && a.entityId !== '-') {
      return <>{ent}: <Link href={noteHref(base, a.entityId)} style={{ color: 'var(--pri)' }}>{a.entityId}</Link></>;
    }
    if (!a.entityId || a.entityId === '-') return ent;
    return `${ent}: ${a.entityId}`;
  };

  return (
    <section aria-labelledby="bs-audit-h">
      <SectionHead id="bs-audit-h" title="Muutoshistoria" meta="200 viimeisintä tapahtumaa" />
      <div style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <legend style={srOnly}>Näytä tapahtumat</legend>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="bs-audit-filter" checked={!onlyAgents} onChange={() => setOnlyAgents(false)} style={{ width: 18, height: 18 }} />
            Kaikki
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, cursor: 'pointer', fontSize: 14 }}>
            <input type="radio" name="bs-audit-filter" checked={onlyAgents} onChange={() => setOnlyAgents(true)} style={{ width: 18, height: 18 }} />
            Vain agentit
          </label>
        </fieldset>

        {audit.loading && <div role="status" style={{ color: 'var(--t3)', fontSize: 14 }}>Ladataan muutoshistoriaa…</div>}
        {audit.error && <div role="alert" style={{ color: 'var(--red)', fontSize: 14 }}>Muutoshistorian lataus epäonnistui: {audit.error}</div>}
        {!audit.loading && !audit.error && rows.length === 0 && <div style={{ color: 'var(--t2)', fontSize: 14 }}>Ei tapahtumia.</div>}

        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-labelledby="bs-audit-h">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', background: 'var(--card2)' }}>
                  {['Aika', 'Tekijä', 'Toiminto', 'Kohde'].map(h => (
                    <th key={h} scope="col" style={{ padding: '8px 10px', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtTime(a.createdAt)}</td>
                    <td style={{ padding: '7px 10px' }}>
                      {a.actorName || a.actorId}
                      <span style={{ color: 'var(--t3)', fontSize: 12 }}> ({a.actorType === 'agent' ? 'agentti' : 'käyttäjä'})</span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>{ACTION_LABELS[a.action] || a.action}</td>
                    <td style={{ padding: '7px 10px', overflowWrap: 'anywhere' }}>{target(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Tietosuoja ───────────────────────────────────────────────────

function PrivacyPanel() {
  return (
    <section aria-labelledby="bs-privacy-h">
      <SectionHead id="bs-privacy-h" title="Tietosuoja" />
      <div style={{ ...brainCard, fontSize: 14, lineHeight: 1.6, color: 'var(--t2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}>
          Aivojen sisältö näkyy vain organisaation jäsenille. Jokainen muutos tallennetaan versiona ja näkyy muutoshistoriassa.
          Datan käsittely on kuvattu tarkemmin dokumentissa docs/aivot-tietosuoja.md.
        </p>
        <p style={{ margin: 0 }}>
          Puheentunnistus: kun kirjaat puheella, ääni käsitellään tällä hetkellä Yhdysvalloissa (OpenAI Whisper).
          Äänitiedosto poistetaan litteroinnin jälkeen.
        </p>
      </div>
    </section>
  );
}
