'use client';

import React, { useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useUserOrgLinks } from '@/lib/use-user-org-links';
import {
  QuickLink,
  LinkTypeKey,
  LINK_TYPES,
  LINK_TYPE_KEYS,
  detectLinkType,
  newQuickLink,
} from '@/lib/link-types';
import { useToast } from '@/lib/toast';

type Scope = 'org' | 'user';

interface AddDraft {
  type: LinkTypeKey;
  label: string;
  url: string;
}

const emptyDraft = (): AddDraft => ({ type: 'web', label: '', url: '' });

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) return `https://${t}`;
  return t;
}

export default function QuickLinksSection() {
  const { activeOrgRole } = useAuth();
  const isAdmin = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  const [orgLinks, setOrgLinks] = useOrgData<QuickLink[]>('quickLinks', []);
  const [userLinks, setUserLinks] = useUserOrgLinks();
  const { toast } = useToast();

  const [adding, setAdding] = useState<Scope | null>(null);
  const [draft, setDraft] = useState<AddDraft>(emptyDraft());

  const startAdd = (scope: Scope) => {
    setDraft(emptyDraft());
    setAdding(scope);
  };

  const cancelAdd = () => {
    setAdding(null);
    setDraft(emptyDraft());
  };

  const submitAdd = (scope: Scope) => {
    const url = normalizeUrl(draft.url);
    if (!url) {
      toast('Lisää URL', 'error');
      return;
    }
    const label = draft.label.trim() || LINK_TYPES[draft.type].label;
    const link = newQuickLink({ type: draft.type, label, url });
    if (scope === 'org') {
      setOrgLinks(prev => [...prev, { ...link, order: prev.length }]);
      toast('Yhteinen linkki lisätty', 'success');
    } else {
      setUserLinks(prev => [...prev, { ...link, order: prev.length }]);
      toast('Linkki lisätty', 'success');
    }
    cancelAdd();
  };

  const removeLink = (scope: Scope, id: string) => {
    if (scope === 'org') {
      setOrgLinks(prev => prev.filter(l => l.id !== id));
    } else {
      setUserLinks(prev => prev.filter(l => l.id !== id));
    }
  };

  const renderTile = (link: QuickLink, scope: Scope, canEdit: boolean) => {
    const def = LINK_TYPES[link.type] || LINK_TYPES.custom;
    return (
      <a
        key={link.id}
        href={link.url}
        target="_blank"
        rel="noreferrer noopener"
        className="ql-tile"
        style={{ '--brand': def.brandColor } as React.CSSProperties}
        title={link.url}
      >
        <span className="ql-icon" aria-hidden>{def.icon}</span>
        <span className="ql-body">
          <span className="ql-label">{link.label || def.label}</span>
          <span className="ql-kind">{def.shortLabel || def.label}</span>
        </span>
        {canEdit && (
          <button
            type="button"
            className="ql-del"
            aria-label="Poista linkki"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (confirm('Poistetaanko linkki?')) removeLink(scope, link.id);
            }}
          >
            ×
          </button>
        )}
      </a>
    );
  };

  const renderAddForm = (scope: Scope) => (
    <div className="ql-form">
      <div className="ql-form-row">
        <select
          value={draft.type}
          onChange={(e) => {
            const t = e.target.value as LinkTypeKey;
            setDraft(d => ({ ...d, type: t }));
          }}
        >
          {LINK_TYPE_KEYS.map(k => (
            <option key={k} value={k}>{LINK_TYPES[k].label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Nimi (vapaaehtoinen)"
          value={draft.label}
          onChange={(e) => setDraft(d => ({ ...d, label: e.target.value }))}
        />
      </div>
      <input
        type="url"
        placeholder={LINK_TYPES[draft.type].urlPlaceholder}
        value={draft.url}
        onChange={(e) => {
          const url = e.target.value;
          setDraft(d => ({
            ...d,
            url,
            type: d.type === 'web' || d.type === 'custom' ? detectLinkType(url) : d.type,
          }));
        }}
        autoFocus
      />
      <div className="ql-form-act">
        <button type="button" className="btn-link" onClick={cancelAdd}>Peruuta</button>
        <button type="button" className="btn" onClick={() => submitAdd(scope)}>Tallenna</button>
      </div>
    </div>
  );

  const sortedOrg = [...orgLinks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sortedUser = [...userLinks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <section style={{ marginTop: 32, marginBottom: 32 }}>
      <div className="sec-h">
        <div className="t"><span className="n">04</span>Pikalinkit</div>
      </div>

      <div className="ql-block">
        <div className="ql-block-h">
          <span className="ql-scope">Yhteiset</span>
          {isAdmin && adding !== 'org' && (
            <button className="btn-link" onClick={() => startAdd('org')}>+ Lisää</button>
          )}
        </div>
        {sortedOrg.length === 0 && adding !== 'org' && (
          <div className="ql-empty">
            {isAdmin
              ? 'Ei yhteisiä linkkejä. Lisää ensimmäinen.'
              : 'Adminin lisäämät yhteiset linkit ilmestyvät tähän.'}
          </div>
        )}
        {sortedOrg.length > 0 && (
          <div className="ql-grid">
            {sortedOrg.map(l => renderTile(l, 'org', isAdmin))}
          </div>
        )}
        {adding === 'org' && renderAddForm('org')}
      </div>

      <div className="ql-block">
        <div className="ql-block-h">
          <span className="ql-scope">Omat</span>
          {adding !== 'user' && (
            <button className="btn-link" onClick={() => startAdd('user')}>+ Lisää</button>
          )}
        </div>
        {sortedUser.length === 0 && adding !== 'user' && (
          <div className="ql-empty">Lisää sinulle tärkeät kansiot ja työkalut. Vain sinä näet nämä.</div>
        )}
        {sortedUser.length > 0 && (
          <div className="ql-grid">
            {sortedUser.map(l => renderTile(l, 'user', true))}
          </div>
        )}
        {adding === 'user' && renderAddForm('user')}
      </div>
    </section>
  );
}
