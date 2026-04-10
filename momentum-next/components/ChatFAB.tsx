'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useOrgData } from '@/lib/firestore';

const WORKER_URL = 'https://momentum-worker.anton-4f9.workers.dev';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatFAB() {
  const { user, activeOrg } = useAuth();
  const [org] = useOrgData<any>('org', {});
  const [projects] = useOrgData<any[]>('projects', []);
  const [events] = useOrgData<any[]>('events', []);
  const [publications] = useOrgData<any[]>('publications', []);
  const [aiProfile] = useOrgData<any>('aiProfile', {});

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Build rich system context from org data
  const buildContext = () => {
    const p: string[] = [];

    // AI Profile (set by Hetki admin) takes priority
    const roleLabels: Record<string, string> = {
      comms: 'viestinnän strateginen kumppani',
      marketing: 'markkinoinnin avustaja',
      project: 'projektipäällikkö-avustaja',
      production: 'tuotannon hallinta-avustaja',
      custom: 'räätälöity avustaja',
    };
    const aiRole = roleLabels[aiProfile.role || 'comms'] || roleLabels.comms;
    p.push(`Olet ${org.name || 'organisaation'} ${aiRole} Hetki Momentumissa.`);

    if (aiProfile.focus) {
      p.push(`\n═══ SINUN FOKUKSESI JA PAINOPISTEESI ═══\n${aiProfile.focus}`);
    }
    if (aiProfile.context) {
      p.push(`\n═══ ORGANISAATION KONTEKSTI ═══\n${aiProfile.context}`);
    }
    if (aiProfile.tone) {
      p.push(`Sävyohje: ${aiProfile.tone}`);
    }
    if (aiProfile.restrictions) {
      p.push(`RAJOITUKSET: ${aiProfile.restrictions}. Älä koskaan riko näitä.`);
    }

    p.push(`\n═══ SINUN PERSOONASI ═══`);
    p.push(`Nimesi on Momentum. Olet tiimin jäsen, et pelkkä työkalu. Sinulla on oma luonne: olet innostunut, käytännönläheinen ja suorapuheinen. Välität aidosti tiimin onnistumisesta.`);
    p.push(`Puhuttele tiimiläisiä nimellä kun tiedät kenelle vastaat. Ehdota konkreettisia toimenpiteitä, älä jää yleiselle tasolle.`);
    p.push(`Vastaa aina suomeksi. Ole lämmin mutta ammattimainen. Pilkettä silmäkulmassa kun tilanne sallii.`);
    p.push(`Kaikki sisältöehdotuksesi noudattavat organisaation strategiaa, arvoja ja viestinnän sävyä.`);
    if (org.tone?.length) p.push(`Viestinnän sävyt: ${org.tone.join(', ')}.`);

    // Organization strategy (top level — guides everything)
    if (org.orgStrategy) {
      const s = org.orgStrategy;
      p.push(`\n═══ ORGANISAATION STRATEGIA ${s.strategicPeriod || ''} ═══`);
      if (s.mission) p.push(`Missio: ${s.mission}`);
      if (s.vision) p.push(`Visio: ${s.vision}`);
      if (s.values?.length) p.push(`Arvot: ${s.values.map((v: any) => `${v.name} (${v.desc})`).join(', ')}`);
    }

    // Communications mission
    if (org.commsMission) p.push(`\nViestinnän missio: ${org.commsMission}`);

    // Content pillars — the backbone of all content
    if (org.contentPillars?.length) {
      p.push(`\n═══ SISÄLTÖPILARIT (kaikki viestintä nojaa näihin) ═══`);
      org.contentPillars.forEach((cp: any) => p.push(`- ${cp.name}: ${cp.desc}`));
    }

    // 2026 current context
    if (org.currentContext) {
      const cc = org.currentContext;
      p.push(`\n═══ 2026 TILANNEKUVA ═══`);
      if (cc.expansion) p.push(`Laajennus: ${cc.expansion}`);
      if (cc.steaCuts) p.push(`Rahoitus: ${cc.steaCuts}`);
      if (cc.accessibility) p.push(`Saavutettavuus: ${cc.accessibility}`);
      if (cc.elections2027) p.push(`Vaikuttaminen: ${cc.elections2027}`);
      if (cc.nameChange) p.push(`Nimenmuutos: ${cc.nameChange}`);
    }

    // Organization context
    if (org.orgContext) {
      const c = org.orgContext;
      p.push(`\nOrganisaatio: ${c.fullName || org.name}. Perustettu ${c.founded || ''}. Kotipaikka: ${c.hq || ''}.`);
      if (c.expansion2026) p.push(`Laajennus: ${c.expansion2026}`);
      if (c.funder) p.push(`Rahoittaja: ${c.funder}`);
      if (c.toivoApp) p.push(`${c.toivoApp}`);
    }

    // Key statistics
    if (org.stats) {
      const s = org.stats;
      p.push(`\nAvainluvut: ${s.tbiAnnual ? s.tbiAnnual + ' aivovammaa/v' : ''}${s.avhAnnual ? ', ' + s.avhAnnual + ' AVH:ta/v' : ''}. ${s.combinedLiving ? s.combinedLiving.toLocaleString() + ' elää seurausten kanssa' : ''}. ${s.dailyNew || ''}`);
      if (s.alcoholRelated) p.push(`Ennaltaehkäisy: ${s.alcoholRelated}`);
    }

    // Strategy
    if (org.strategyText) p.push(`\nViestintästrategia:\n${org.strategyText.slice(0, 3000)}`);

    // Goals with full details
    if (org.goals?.length) p.push(`\nViestinnän tavoitteet:\n${org.goals.map((g: any) => `- ${g.t} (${g.m || ''}): ${g.d || ''}`).join('\n')}`);

    // Key messages
    if (org.keyMessages?.length) p.push(`\nYdinviestit:\n${org.keyMessages.map((m: any) => `- ${m.title}: ${m.desc} [${m.theme}]`).join('\n')}`);

    // Audiences with channel preferences
    if (org.auds?.length) p.push(`\nKohderyhmät:\n${org.auds.map((a: any) => `- ${a.n}: ${a.d || ''}${a.c ? ' → Kanavat: ' + a.c.join(', ') : ''}`).join('\n')}`);

    // Brand values
    if (org.vals?.length) p.push(`\nBrändiarvot: ${org.vals.map((v: any) => `${v.t} (${v.d || ''})`).join(', ')}`);

    // Channels
    if (org.channels?.length) p.push(`\nViestintäkanavat: ${org.channels.map((c: any) => c.name).join(', ')}`);

    // Team with responsibilities
    if (org.team?.length) p.push(`\nViestintätiimi:\n${org.team.map((t: any) => `- ${t.name}, ${t.role}${t.desc ? ': ' + t.desc : ''}`).join('\n')}`);

    // Campaigns
    if (org.campaigns?.length) p.push(`\nVuosittaiset kampanjat:\n${org.campaigns.map((c: any) => `- ${c.name}${c.month ? ' (kk ' + c.month + ')' : ''}: ${c.desc}`).join('\n')}`);

    // Member survey insights
    if (org.memberSurvey) {
      const ms = org.memberSurvey;
      p.push(`\nJäsenkysely (${ms.respondents} vastaajaa): ${ms.notFollowSome}% EI seuraa somea, ${ms.readAivoitus}% lukee Aivoituksen, ${ms.preferPrint}% haluaa painetun lehden, ${ms.followFacebook}% seuraa FB:tä, ${ms.followWebsite}% seuraa nettisivuja. Ikäryhmä: ${ms.ageGroup}. ${ms.brainInjurySurvivors}% vastaajista itse aivovaurion kokeneita.`);
    }

    // Live data: projects, events, publications
    if (projects?.length) {
      const active = projects.filter((pr: any) => pr.st === 'active' && !pr.archived);
      if (active.length) p.push(`\nAktiiviset projektit:\n${active.map((pr: any) => `- ${pr.t} (deadline: ${pr.deadline || 'ei'}, ${pr.tasks?.length || 0} tehtävää)`).join('\n')}`);
    }
    if (events?.length) {
      const upcoming = events.filter((e: any) => e.date >= new Date().toISOString().slice(0, 10)).slice(0, 15);
      if (upcoming.length) p.push(`\nTulevat tapahtumat:\n${upcoming.map((e: any) => `- ${e.date}: ${e.t} (${e.ch || ''}) [${e.st}]`).join('\n')}`);
    }
    if (publications?.length) {
      const recent = publications.slice(0, 8);
      if (recent.length) p.push(`\nJulkaisut:\n${recent.map((pb: any) => `- ${pb.title} → ${(pb.channels || []).join(', ')} [${pb.status}]`).join('\n')}`);
    }

    p.push(`\nTänään on ${new Date().toLocaleDateString('fi-FI', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`);

    return p.join('\n');
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(WORKER_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Momentum-Org': activeOrg || '' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          systemContext: buildContext(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response || 'Virhe vastauksessa.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Yhteysvirhe. Yritä uudelleen.' }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Yhteysvirhe. Tarkista verkkoyhteys.' }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'Mitä julkaista tällä viikolla?',
    'Ehdota somesisältöä',
    'Miten tavoitan ammattilaiset?',
    'Arvioi viestintästrategiamme',
  ];

  if (!user || !activeOrg) return null;

  return (
    <>
      {/* FAB button */}
      {!open && (
        <button onClick={() => setOpen(true)} style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 1000,
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          background: 'var(--pri)', color: '#fff', fontSize: '1.2rem', fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(5,107,159,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', transition: 'all .2s',
        }}
          onMouseEnter={e => { (e.currentTarget as any).style.transform = 'scale(1.08)'; }}
          onMouseLeave={e => { (e.currentTarget as any).style.transform = 'scale(1)'; }}
        >M</button>
      )}

      {/* Chat panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.3)',
          }} />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw',
            zIndex: 1000, background: 'var(--card)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            animation: 'slideInRight .3s ease-out',
          }}>
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.95rem', fontWeight: 500, letterSpacing: '.02em' }}>
                  Momentum
                </h3>
                <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                  {org.name || 'Organisaatio'} — viestinnän sparraus
                </p>
              </div>
              <button onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', color: 'var(--t3)', fontSize: '1.2rem',
                cursor: 'pointer', padding: '.25rem',
              }}>{'\u2715'}</button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{
              flex: 1, overflowY: 'auto', padding: '1.25rem',
              display: 'flex', flexDirection: 'column', gap: '.75rem',
            }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: '1rem', opacity: .3, fontFamily: 'var(--font-display)', letterSpacing: '.04em' }}>MOMENTUM</div>
                  <h4 style={{ fontSize: '.95rem', fontWeight: 700, marginBottom: '.5rem' }}>Miten voin auttaa?</h4>
                  <p style={{ fontSize: '.82rem', color: 'var(--t3)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    Tunnen {org.name || 'organisaatiosi'} viestintästrategian, kohderyhmät ja tavoitteet. Kysy mitä tahansa viestintään liittyvää.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    {suggestions.map(s => (
                      <button key={s} onClick={() => { setInput(s); }} style={{
                        background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                        padding: '.6rem .85rem', fontSize: '.8rem', color: 'var(--t2)', cursor: 'pointer',
                        textAlign: 'left', transition: 'all .15s',
                      }}
                        onMouseEnter={e => { (e.currentTarget as any).style.borderColor = 'var(--pri)'; }}
                        onMouseLeave={e => { (e.currentTarget as any).style.borderColor = 'var(--border)'; }}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '.5rem',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: msg.role === 'assistant' ? 'var(--pri)' : 'var(--elev)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.6rem', fontWeight: 700, color: msg.role === 'assistant' ? '#fff' : 'var(--t2)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {msg.role === 'assistant' ? 'AI' : (user?.displayName?.[0] || 'K')}
                  </div>
                  <div style={{
                    maxWidth: '80%', padding: '.7rem 1rem', borderRadius: 'var(--rl)',
                    background: msg.role === 'user' ? 'var(--pri)' : 'var(--elev)',
                    color: msg.role === 'user' ? '#fff' : 'var(--t1)',
                    fontSize: '.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>M</div>
                  <div style={{ padding: '.7rem 1rem', background: 'var(--elev)', borderRadius: 'var(--rl)' }}>
                    <div className="typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{
              padding: '1rem 1.25rem', borderTop: '1px solid var(--border)',
              display: 'flex', gap: '.5rem',
            }}>
              <input
                className="input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Kysy viestinnästä..."
                style={{ flex: 1, fontSize: '.88rem' }}
                disabled={loading}
              />
              <button onClick={sendMessage} disabled={!input.trim() || loading} style={{
                background: 'var(--pri)', color: '#fff', border: 'none',
                borderRadius: 'var(--r)', padding: '.5rem 1rem', fontSize: '.85rem',
                fontWeight: 600, cursor: 'pointer', opacity: !input.trim() || loading ? .5 : 1,
              }}>
                {'\u2192'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
