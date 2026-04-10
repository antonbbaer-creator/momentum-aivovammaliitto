'use client';

/*
 * ChatSidebar — vasemman palstan kanavalista.
 * Näyttää: tiimikanavat, muut public-kanavat, private, DMit, group DMit.
 * Tukee: aktiivisen valinta, lukematta-badget, uuden DM/kanavan luonti.
 */

import { useState, useMemo } from 'react';
import {
  Channel,
  UserChatState,
  partitionChannels,
  sortChannelsForSidebar,
  displayNameFor,
  dmChannel,
} from '@/lib/chat-shared';
import { MOMENTUM_BOT_ID, MOMENTUM_BOT_NAME, MOMENTUM_BOT_COLOR, isMomentumDm } from '@/lib/claude-bot';
import { OrgTeam, OrgTeamMember } from '@/lib/team-shared';

interface Props {
  channels: Channel[];
  activeChannelId: string;
  onSelectChannel: (id: string) => void;
  chatState: UserChatState;
  setChatState: (fn: (prev: UserChatState) => UserChatState) => void;
  teamMembers: OrgTeamMember[];
  orgTeams: OrgTeam[];
  myId: string | null;
  allChannels: Channel[];
  setChannels: (fn: (prev: Channel[]) => Channel[]) => void;
}

export default function ChatSidebar({
  channels,
  activeChannelId,
  onSelectChannel,
  chatState,
  teamMembers,
  orgTeams,
  myId,
  allChannels,
  setChannels,
}: Props) {
  const [search, setSearch] = useState('');
  const [showNewDm, setShowNewDm] = useState(false);

  const sorted = useMemo(() => sortChannelsForSidebar(channels, chatState), [channels, chatState]);
  const filtered = search.trim()
    ? sorted.filter(c => {
        const name = displayNameFor(c, myId, teamMembers).toLowerCase();
        return name.includes(search.toLowerCase());
      })
    : sorted;

  const { teams, publics, privates, dms: allDms, groups } = useMemo(
    () => partitionChannels(filtered),
    [filtered]
  );

  // Erota Momentum-DM tavallisista DMeistä
  const momentumDm = allDms.find(isMomentumDm) || null;
  const dms = allDms.filter(ch => !isMomentumDm(ch));

  // "Viimeksi luettu" aikaleimat per kanava
  const getUnread = (ch: Channel, messageCount: number = 0) => {
    const lastMsg = ch.lastMessageAt || 0;
    const lastRead = chatState.lastReadAt?.[ch.id] || 0;
    if (lastMsg > lastRead && ch.id !== activeChannelId) {
      return true;
    }
    return false;
  };

  const renderChannelRow = (ch: Channel) => {
    const active = ch.id === activeChannelId;
    const unread = getUnread(ch);
    const name = displayNameFor(ch, myId, teamMembers);
    const color = ch.color;

    return (
      <div
        key={ch.id}
        onClick={() => onSelectChannel(ch.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '.55rem',
          padding: '.4rem .65rem',
          margin: '1px .4rem',
          borderRadius: 6,
          cursor: 'pointer',
          background: active ? 'var(--pri)' : 'transparent',
          color: active ? '#fff' : unread ? 'var(--t1)' : 'var(--t2)',
          fontWeight: active || unread ? 600 : 500,
          fontSize: '.8rem',
          transition: 'background .1s',
        }}
        onMouseEnter={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--elev)';
        }}
        onMouseLeave={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        {ch.type === 'team' && color ? (
          <span style={{
            width: 16, height: 16, borderRadius: 4,
            background: active ? 'rgba(255,255,255,.25)' : `${color}30`,
            color: active ? '#fff' : color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '.65rem', fontWeight: 700, flexShrink: 0,
            fontFamily: 'var(--font-display)',
          }}>{ch.icon || '#'}</span>
        ) : (
          <span style={{
            fontSize: '.8rem', opacity: active ? 1 : 0.6, width: 16, textAlign: 'center', flexShrink: 0,
          }}>
            {ch.type === 'dm' ? '●' : ch.type === 'group' ? '◉' : ch.type === 'private' ? '◆' : '#'}
          </span>
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        {unread && !active && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--pri)',
            flexShrink: 0,
          }} />
        )}
      </div>
    );
  };

  const sectionHeader = (label: string, action?: { label: string; onClick: () => void }) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '.85rem .85rem .3rem',
    }}>
      <span style={{
        fontSize: '.62rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.08em',
        color: 'var(--t3)',
      }}>{label}</span>
      {action && (
        <button
          onClick={action.onClick}
          title={action.label}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--t3)',
            cursor: 'pointer',
            fontSize: '.9rem',
            padding: 0,
            width: 18,
            height: 18,
            lineHeight: 1,
          }}
        >+</button>
      )}
    </div>
  );

  const createDmWith = (member: OrgTeamMember) => {
    if (!myId) return;
    const me = teamMembers.find(m => m.id === myId);
    if (!me) return;
    const newCh = dmChannel(me, member);
    const exists = allChannels.find(c => c.id === newCh.id);
    if (!exists) {
      setChannels(prev => [...(prev || []), newCh]);
    }
    onSelectChannel(newCh.id);
    setShowNewDm(false);
  };

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--elev)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Search */}
      <div style={{ padding: '.75rem', borderBottom: '1px solid var(--border)' }}>
        <input
          className="input"
          placeholder="Hae kanavia..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: '.78rem', padding: '.45rem .6rem', width: '100%' }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '1rem' }}>
        {/* Momentum AI — oma sektionsa ylhäällä */}
        {momentumDm && (
          <>
            {sectionHeader('AI-avustaja')}
            <div
              onClick={() => onSelectChannel(momentumDm.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.55rem',
                padding: '.5rem .65rem',
                margin: '1px .4rem',
                borderRadius: 6,
                cursor: 'pointer',
                background: activeChannelId === momentumDm.id ? MOMENTUM_BOT_COLOR : 'transparent',
                color: activeChannelId === momentumDm.id ? '#fff' : 'var(--t1)',
                fontWeight: 600,
                fontSize: '.82rem',
                transition: 'background .1s',
              }}
              onMouseEnter={e => {
                if (activeChannelId !== momentumDm.id) (e.currentTarget as HTMLElement).style.background = 'var(--elev)';
              }}
              onMouseLeave={e => {
                if (activeChannelId !== momentumDm.id) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 5,
                background: activeChannelId === momentumDm.id ? 'rgba(255,255,255,.25)' : MOMENTUM_BOT_COLOR,
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.7rem', fontWeight: 700, flexShrink: 0,
                fontFamily: 'var(--font-display)',
              }}>M</span>
              <span style={{ flex: 1 }}>{MOMENTUM_BOT_NAME}</span>
              <span style={{
                fontSize: '.5rem',
                padding: '.1rem .35rem',
                borderRadius: 3,
                background: activeChannelId === momentumDm.id ? 'rgba(255,255,255,.2)' : `${MOMENTUM_BOT_COLOR}25`,
                color: activeChannelId === momentumDm.id ? '#fff' : MOMENTUM_BOT_COLOR,
                fontWeight: 700,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
              }}>AI</span>
            </div>
          </>
        )}

        {/* Yleinen + muut public-kanavat */}
        {publics.length > 0 && (
          <>
            {sectionHeader('Kanavat')}
            {publics.map(renderChannelRow)}
          </>
        )}

        {/* Tiimikanavat */}
        {teams.length > 0 && (
          <>
            {sectionHeader('Tiimit')}
            {teams.map(renderChannelRow)}
          </>
        )}

        {/* Private-kanavat */}
        {privates.length > 0 && (
          <>
            {sectionHeader('Yksityiset')}
            {privates.map(renderChannelRow)}
          </>
        )}

        {/* DMs */}
        {sectionHeader('Yksityisviestit', { label: 'Uusi yksityisviesti', onClick: () => setShowNewDm(v => !v) })}
        {dms.map(renderChannelRow)}
        {groups.map(renderChannelRow)}
        {dms.length === 0 && groups.length === 0 && !showNewDm && (
          <div style={{ padding: '.3rem .85rem', fontSize: '.68rem', color: 'var(--t3)', fontStyle: 'italic' }}>
            Ei viestejä. Klikkaa + aloittaaksesi.
          </div>
        )}

        {/* Uuden DM:n popup — lista tiimiläisistä */}
        {showNewDm && (
          <div style={{
            margin: '.4rem .4rem .6rem',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '.4rem',
            maxHeight: 240,
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '.64rem', color: 'var(--t3)', padding: '.2rem .4rem .35rem', fontWeight: 600, textTransform: 'uppercase' }}>Valitse henkilö</div>
            {teamMembers.filter(m => m.id !== myId).map(m => {
              const team = orgTeams.find(t => t.id === m.teamId);
              return (
                <div
                  key={m.id}
                  onClick={() => createDmWith(m)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '.5rem',
                    padding: '.35rem .4rem', borderRadius: 4,
                    cursor: 'pointer', fontSize: '.76rem',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--elev)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: team?.color || 'var(--t3)',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.6rem', fontWeight: 700,
                  }}>{m.name[0]}</span>
                  <span style={{ flex: 1 }}>{m.name}</span>
                  {team && (
                    <span style={{ fontSize: '.58rem', color: team.color, fontWeight: 600 }}>{team.icon}</span>
                  )}
                </div>
              );
            })}
            <button
              onClick={() => setShowNewDm(false)}
              style={{
                width: '100%',
                marginTop: '.3rem',
                background: 'transparent',
                border: 'none',
                color: 'var(--t3)',
                fontSize: '.68rem',
                cursor: 'pointer',
                padding: '.3rem',
              }}
            >Peruuta</button>
          </div>
        )}
      </div>
    </div>
  );
}
