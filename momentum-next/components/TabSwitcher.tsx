'use client';

interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: string;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  style?: React.CSSProperties;
}

export default function TabSwitcher({ tabs, active, onChange, style }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--elev)',
        borderRadius: 'var(--r)',
        padding: '3px',
        marginBottom: '1.25rem',
        width: 'fit-content',
        flexWrap: 'wrap',
        gap: 2,
        ...style,
      }}
    >
      {tabs.map(t => (
        <button
          key={t.id}
          className={`cal-view-btn ${active === t.id ? 'act' : ''}`}
          onClick={() => onChange(t.id)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}
        >
          {t.icon && <span style={{ fontSize: '.92rem', lineHeight: 1 }}>{t.icon}</span>}
          <span>{t.label}</span>
          {t.count !== undefined && (
            <span style={{ opacity: 0.7, fontSize: '.72rem' }}>({t.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
