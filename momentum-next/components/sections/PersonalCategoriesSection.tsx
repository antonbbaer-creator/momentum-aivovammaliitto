'use client';

import { useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import {
  PersonalCategory,
  PersonalSettings,
  newId,
} from '@/lib/personal-shared';

const DEFAULT_COLORS = [
  '#056b9f', '#f1b434', '#e45c81', '#2a8a86',
  '#9b7cf6', '#f09a52', '#185e5b', '#3788b2',
];

interface Draft {
  name: string;
  color: string;
}

const emptyDraft = (): Draft => ({ name: '', color: DEFAULT_COLORS[0] });

export default function PersonalCategoriesSection() {
  const [categories, setCategories] = useUserData<PersonalCategory[]>('categories', []);
  const [settings, setSettings] = useUserData<PersonalSettings>('settings', {
    weekStart: 'mon',
    dayStart: '06:00',
    dayEnd: '23:00',
  });

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const submit = () => {
    const name = draft.name.trim();
    if (!name) return;
    const c: PersonalCategory = { id: newId(), name, color: draft.color };
    setCategories(prev => [...prev, c]);
    setDraft(emptyDraft());
    setAdding(false);
  };

  const remove = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div style={{ padding: '0 36px 60px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
            Elämän alueet
          </h2>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--ink2)', padding: '6px 12px', cursor: 'pointer', color: 'var(--ink)' }}
            >
              + Lisää alue
            </button>
          )}
        </div>

        <p style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 0, marginBottom: 14 }}>
          Esim. Aivovammaliitto, LEF, Perhe, Liikunta. Värit näkyvät viikkokalenterissa ja yhteenvedossa.
        </p>

        {adding && (
          <div style={{ border: '1px solid var(--rule)', padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              autoFocus
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Alueen nimi"
              style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '8px 10px', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DEFAULT_COLORS.map(col => (
                <button
                  key={col}
                  onClick={() => setDraft(d => ({ ...d, color: col }))}
                  aria-label={`Väri ${col}`}
                  style={{
                    width: 28, height: 28, borderRadius: 0, cursor: 'pointer',
                    background: col,
                    border: draft.color === col ? '2px solid var(--ink)' : '1px solid var(--rule)',
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submit} style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '6px 14px', cursor: 'pointer' }}>
                Tallenna
              </button>
              <button onClick={() => { setAdding(false); setDraft(emptyDraft()); }} style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule)', padding: '6px 14px', cursor: 'pointer' }}>
                Peruuta
              </button>
            </div>
          </div>
        )}

        {categories.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
            Ei alueita vielä. Lisää ensimmäinen yllä.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {categories.map(c => (
              <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
                <span style={{ width: 16, height: 16, background: c.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{c.name}</span>
                <button
                  onClick={() => remove(c.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14 }}
                  aria-label="Poista"
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: '0 0 12px' }}>
          Viikon näkyvät tunnit
        </h2>
        <p style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 0, marginBottom: 14 }}>
          Viikkokalenterissa näkyvä aikaikkuna. Voit silti merkitä lohkoja näiden ulkopuolelle.
        </p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            Alkaa
            <input
              type="time"
              value={settings.dayStart || '06:00'}
              onChange={e => setSettings(s => ({ ...s, dayStart: e.target.value }))}
              style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            Päättyy
            <input
              type="time"
              value={settings.dayEnd || '23:00'}
              onChange={e => setSettings(s => ({ ...s, dayEnd: e.target.value }))}
              style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            Viikko alkaa
            <select
              value={settings.weekStart || 'mon'}
              onChange={e => setSettings(s => ({ ...s, weekStart: e.target.value as 'mon' | 'sun' }))}
              style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)' }}
            >
              <option value="mon">Maanantaina</option>
              <option value="sun">Sunnuntaina</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
