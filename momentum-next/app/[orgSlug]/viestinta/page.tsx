'use client';

import { Suspense } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import TabSwitcher from '@/components/TabSwitcher';
import PublicationQueueSection from '@/components/sections/PublicationQueueSection';
import PublicationDetailSection from '@/components/sections/PublicationDetailSection';
import CalendarSection from '@/components/sections/CalendarSection';
import MediaSection from '@/components/sections/MediaSection';
import ChannelsSection from '@/components/sections/ChannelsSection';
import EditorSection from '@/components/sections/EditorSection';
import CommsPlanSection from '@/components/sections/CommsPlanSection';

// Fullscreen (no-tab) views that still live under ?tab=...
// Editori on nyt yläpaneelissa tabina — vain detail jää fullscreeniksi.
const FULLSCREEN_VIEWS = ['detail'] as const;
type FullscreenView = (typeof FULLSCREEN_VIEWS)[number];

// Järjestys: Suunnitelma → Kalenteri → Tuotanto → Editori → Mediapankki → Julkaisu
// - "Tuotanto" = työjono (brief → draft → ready → published)
// - "Julkaisu" = kanavat / julkaisu­konfiguraatio
const MAIN_TABS = ['plan', 'calendar', 'production', 'editor', 'media', 'publish'] as const;
type MainTab = (typeof MAIN_TABS)[number];

type ViewId = MainTab | FullscreenView;

function isMainTab(s: string | null): s is MainTab {
  return s !== null && (MAIN_TABS as readonly string[]).includes(s);
}

function isFullscreen(s: string | null): s is FullscreenView {
  return s !== null && (FULLSCREEN_VIEWS as readonly string[]).includes(s);
}

// Legacy-ID:t → uudet ID:t (jos joku kirjanmerkki tai vanha URL tulee sisään)
function migrateLegacyTab(raw: string | null): string | null {
  if (raw === 'queue') return 'production';
  if (raw === 'timeline') return 'calendar';
  if (raw === 'channels') return 'publish';
  return raw;
}

function ViestintaContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const rawTab = migrateLegacyTab(searchParams.get('tab'));
  const view: ViewId = isMainTab(rawTab) || isFullscreen(rawTab) ? rawTab : 'plan';
  const activeId = searchParams.get('id'); // used by 'detail' view
  const editorPubId = searchParams.get('pubId'); // used when jumping into editor with a preloaded pub

  const navigate = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const openDetail = (id: string) => navigate({ tab: 'detail', id });
  const openEditor = (pubId?: string) => navigate({ tab: 'editor', pubId: pubId ?? null, id: null });
  const openProduction = () => navigate({ tab: 'production', id: null, pubId: null });

  // ============ FULLSCREEN VIEWS (no TabSwitcher) ============
  if (view === 'detail' && activeId) {
    return (
      <AppShell title="Julkaisu" subtitle="Brief, sisältö ja materiaalit yhdessä näkymässä">
        <PublicationDetailSection
          publicationId={activeId}
          onBack={openProduction}
          onOpenEditor={(id) => openEditor(id)}
        />
      </AppShell>
    );
  }

  // ============ MAIN TABBED VIEWS ============
  const mainTab: MainTab = isMainTab(rawTab) ? rawTab : 'plan';

  const setMainTab = (id: MainTab) => navigate({ tab: id, id: null, pubId: null });

  const subtitle =
    mainTab === 'plan'       ? 'Suunnitelma: mitä, miten, kuka — sekä kuukausikattavuus' :
    mainTab === 'calendar'   ? 'Julkaisukalenteri — kuukausi- ja listanäkymä' :
    mainTab === 'production' ? 'Tuotanto: brief → luonnos → valmis → julkaistu' :
    mainTab === 'editor'     ? 'Editori — luo julkaisugrafiikkaa' :
    mainTab === 'media'      ? 'Mediapankki' :
                               'Kanavat ja julkaisuvirta — valmiit julkaisut kanavittain';

  return (
    <AppShell title="Viestintä" subtitle={subtitle}>
      <TabSwitcher
        tabs={[
          { id: 'plan',       label: 'Suunnitelma', icon: '▶' },
          { id: 'calendar',   label: 'Kalenteri',   icon: '◌' },
          { id: 'production', label: 'Tuotanto',    icon: '◉' },
          { id: 'editor',     label: 'Editori',     icon: '◈' },
          { id: 'media',      label: 'Mediapankki', icon: '▣' },
          { id: 'publish',    label: 'Julkaisu',    icon: '◇' },
        ]}
        active={mainTab}
        onChange={(id) => setMainTab(id as MainTab)}
      />

      {mainTab === 'plan' && (
        <CommsPlanSection
          onOpenCalendar={() => setMainTab('calendar')}
          onOpenQueue={() => setMainTab('production')}
        />
      )}
      {mainTab === 'calendar' && (
        <CalendarSection
          mode="viestinta"
          onOpenPublication={openDetail}
          onOpenPlan={() => setMainTab('plan')}
        />
      )}
      {mainTab === 'production' && (
        <PublicationQueueSection
          onOpenDetail={openDetail}
          onOpenEditor={openEditor}
        />
      )}
      {mainTab === 'editor' && <EditorSection />}
      {mainTab === 'media' && <MediaSection />}
      {mainTab === 'publish' && (
        <ChannelsSection onOpenDetail={openDetail} onOpenEditor={openEditor} />
      )}
    </AppShell>
  );
}

export default function ViestintaPage() {
  return (
    <Suspense
      fallback={
        <div className="onb">
          <div className="onb-wrap" style={{ textAlign: 'center' }}>
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      }
    >
      <ViestintaContent />
    </Suspense>
  );
}
