import { SearchBar } from './SearchBar';
import { hasViewTransitions } from '@/lib/motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { MenuLayer } from '@/components/MenuLayer';
import { DialogLayer } from '@/components/Dialogs';
import { Toasts } from '@/components/Toasts';
import { useNav, type Route } from '@/state/nav';
import { useUi } from '@/state/ui';
import { HomePage } from '@/pages/HomePage';
import { useAppearance } from '@/lib/appearance';
import { artworkAtPixels } from '@/lib/artwork';
import { rgb, type Rgb } from '@/lib/palette';
import { usePlayer } from '@/state/player';
import type { PageBackground as PageBackgroundKind } from '@shared/types';
import { PlayerBar } from './PlayerBar';
import { Sidebar } from './Sidebar';
import { UpNext } from './UpNext';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { WindowControls } from './WindowControls';
import { FirstRunGuide } from './FirstRunGuide';
import { TastePicker } from './TastePicker';
import { UpdateDialog } from './UpdateDialog';
import { WhatsNew } from './WhatsNew';
import { OfflinePill } from './OfflinePill';
import { Segmented } from '@/components/Segmented';

/*
 * Pages, the full-screen player and the lyrics load when first opened, so starting Sonara only reads
 * Home and the player bar. A few seconds after start the rest load in the background anyway, so
 * opening any of them later is as quick as before.
 */
const loaders: (() => Promise<unknown>)[] = [];
function onDemand<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  loaders.push(load);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return lazy(async () => ({ default: (await load())[name] as M[K] & ComponentType<any> }));
}
const SettingsPage = onDemand(() => import('@/pages/SettingsPage'), 'SettingsPage');
const WrappedPage = onDemand(() => import('@/pages/WrappedPage'), 'WrappedPage');
const DownloadsPage = onDemand(() => import('@/pages/DownloadsPage'), 'DownloadsPage');
const SearchPage = onDemand(() => import('@/pages/SearchPage'), 'SearchPage');
const ArtistPage = onDemand(() => import('@/pages/ArtistPage'), 'ArtistPage');
const AlbumPage = onDemand(() => import('@/pages/AlbumPage'), 'AlbumPage');
const PlaylistPage = onDemand(() => import('@/pages/PlaylistPage'), 'PlaylistPage');
const LikedPage = onDemand(() => import('@/pages/LibraryPages'), 'LikedPage');
const RecentPage = onDemand(() => import('@/pages/LibraryPages'), 'RecentPage');
const LocalPlaylistPage = onDemand(() => import('@/pages/LibraryPages'), 'LocalPlaylistPage');
const YourMusicPage = onDemand(() => import('@/pages/YourMusicPage'), 'YourMusicPage');
const YourAlbumPage = onDemand(() => import('@/pages/YourMusicPage'), 'YourAlbumPage');
const FullScreenPlayer = onDemand(() => import('./FullScreenPlayer'), 'FullScreenPlayer');
const LyricsView = onDemand(() => import('./LyricsView'), 'LyricsView');
const MoodsPage = onDemand(() => import('@/pages/MoodsPage'), 'MoodsPage');
const MoodPage = onDemand(() => import('@/pages/MoodsPage'), 'MoodPage');

/** The rest of the app, fetched once Sonara has started and is idle. */
function preloadPages() {
  const run = () => loaders.forEach((load) => void load().catch(() => undefined));
  window.setTimeout(() => ('requestIdleCallback' in window ? window.requestIdleCallback(run, { timeout: 4000 }) : run()), 2500);
}

function RoutePage({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'search':
      return <SearchPage q={route.q} tab={route.tab} />;
    case 'album':
      return <AlbumPage id={route.id} />;
    case 'artist':
      return <ArtistPage id={route.id} />;
    case 'playlist':
      return <PlaylistPage id={route.id} />;
    case 'liked':
      return <LikedPage />;
    case 'recent':
      return <RecentPage />;
    case 'local':
      return <LocalPlaylistPage id={route.id} />;
    case 'music':
      return <YourMusicPage tab={route.tab} />;
    case 'musicAlbum':
      return <YourAlbumPage source={route.source} id={route.id} />;
    case 'settings':
      return <SettingsPage tab={route.tab} />;
    case 'downloads':
      return <DownloadsPage />;
    case 'moods':
      return <MoodsPage />;
    case 'mood':
      return <MoodPage key={route.params} params={route.params} title={route.title} color={route.color} />;
    case 'wrapped':
      return <WrappedPage key={route.month ?? 'latest'} month={route.month} />;
  }
}

/** The strip along the top of the content: window dragging, back and forward. */
function TopBar({ scrolled }: { scrolled: boolean }) {
  const canBack = useNav((s) => s.index > 0);
  const canForward = useNav((s) => s.index < s.stack.length - 1);
  const { back, forward } = useNav.getState();
  const button = 'grid size-7 place-items-center rounded-full text-primary transition-colors hover:bg-white/10 disabled:text-tertiary disabled:hover:bg-transparent';
  return (
    // The toolbar floats over the content; where content scrolls beneath it, the scroll edge effect blurs it away.
    <div className="app-drag sticky top-0 z-20 -mb-(--titlebar-height) h-(--titlebar-height)">
      <div className={`scroll-edge-top pointer-events-none absolute inset-x-0 top-0 h-[84px] transition-opacity duration-300 ${scrolled ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
      <div className="relative flex h-full items-center gap-3 pr-[150px] pl-[calc(var(--content-left)+14px)]">
        {/* Back and forward act on the same thing, so they share one piece of glass. */}
        <div data-elastic="0.6" className="glass elastic app-no-drag relative flex h-[34px] items-center gap-0.5 rounded-pill px-[3px]">
          <button className={button} disabled={!canBack} aria-label="Back" title="Back (Alt+←)" onClick={back}>
            <ChevronLeft size={19} strokeWidth={2.2} />
          </button>
          <button className={button} disabled={!canForward} aria-label="Forward" title="Forward (Alt+→)" onClick={forward}>
            <ChevronRight size={19} strokeWidth={2.2} />
          </button>
        </div>
        {/* Search sits in the toolbar, centred over the page. */}
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="w-full max-w-[460px] min-w-[160px]">
            <SearchBar />
          </div>
        </div>
      </div>
    </div>
  );
}

function SidePanel() {
  const panel = useUi((s) => s.sidePanel);
  const setPanel = useUi((s) => s.setSidePanel);
  if (!panel) return null;
  return (
    // An inspector: edge-to-edge glass alongside the content (Apple's Mac inspectors).
    <aside className="glass-thick absolute top-0 right-0 bottom-0 z-30 flex w-(--side-panel-width) animate-slide-in flex-col rounded-none pt-(--titlebar-height)" aria-label={panel === 'lyrics' ? 'Lyrics' : 'Up Next'}>
      <div className="app-drag absolute inset-x-0 top-0 h-(--titlebar-height)" />
      <div className="relative flex flex-none items-center justify-between gap-3 px-4 pb-3">
        <Segmented
          tabs
          value={panel}
          options={[
            { value: 'lyrics', label: 'Lyrics' },
            { value: 'queue', label: 'Up Next' },
          ]}
          onChange={(p) => setPanel(p)}
          stretch
          label="Panel"
        />
        <button className="grid size-8 flex-none place-items-center rounded-full bg-white/[0.08] text-secondary hover:bg-white/15 hover:text-primary" aria-label="Close panel" onClick={() => setPanel(null)}>
          <X size={16} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1 [mask-image:linear-gradient(180deg,transparent,#000_24px,#000_calc(100%-90px),transparent)]">{panel === 'lyrics' ? (
          <Suspense fallback={null}>
            <LyricsView />
          </Suspense>
        ) : (
          <UpNext />
        )}</div>
    </aside>
  );
}

/** Settings › Appearance › Page background: the plain page colour, a still gradient in the accent, or the playing artwork, blurred. */
function PageBackground({ kind, accent }: { kind: PageBackgroundKind; accent: Rgb }) {
  const thumbnail = usePlayer((s) => s.queue[s.index]?.track.thumbnail);
  if (kind === 'gradient')
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse 85% 60% at 90% -10%, ${rgb(accent, 0.32)}, transparent 70%), radial-gradient(ellipse 70% 55% at -5% 105%, ${rgb(accent, 0.16)}, transparent 70%)` }}
        aria-hidden="true"
      />
    );
  if (kind === 'artwork' && thumbnail)
    return (
      <img
        key={thumbnail}
        src={artworkAtPixels(thumbnail, 400)}
        alt=""
        className="pointer-events-none absolute inset-0 size-full scale-125 animate-fade-in object-cover opacity-30 blur-[90px] saturate-150"
        aria-hidden="true"
      />
    );
  return null;
}

export function AppShell() {
  useEffect(preloadPages, []);
  useKeyboardShortcuts();
  const { glow, accent, background } = useAppearance();
  const entry = useNav((s) => s.stack[s.index]!);
  const saveScroll = useNav((s) => s.saveScroll);
  const fullScreen = useUi((s) => s.fullScreen);
  // Covered: the full-screen player has finished opening over the app (it shows again the moment it closes).
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    if (!fullScreen) return setCovered(false);
    const t = setTimeout(() => setCovered(true), 900);
    return () => clearTimeout(t);
  }, [fullScreen]);
  const sidePanel = useUi((s) => s.sidePanel);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Each page opens at the top, and going back returns to where it was left.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = entry.scroll;
    const restore = setTimeout(() => (el.scrollTop = entry.scroll), 350);
    return () => {
      clearTimeout(restore);
      saveScroll(el.scrollTop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.key]);

  useEffect(() => {
    document.title = 'Sonara';
  }, []);

  return (
    <div className="relative h-full overflow-hidden bg-page">
      {/* Under the full-screen player once it's open, the app isn't drawn (or animated) at all. */}
      <div className="contents" style={covered && fullScreen ? { visibility: "hidden" } : undefined}>
      <PageBackground kind={background} accent={accent} />
      {/* Ambient glow: the playing song's colour, softly behind everything. */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{ opacity: glow ? 1 : 0, background: glow ? `radial-gradient(ellipse 70% 55% at 75% 0%, ${rgb(glow, 0.55)}, transparent 70%), radial-gradient(ellipse 50% 45% at 10% 100%, ${rgb(glow, 0.35)}, transparent 70%)` : undefined }}
        aria-hidden="true"
      />
      <Sidebar />
      {/* Content runs the full width of the window, beneath the floating sidebar. */}
      <main
        ref={scroller}
        className={`absolute inset-0 overflow-x-hidden overflow-y-auto ${sidePanel ? 'mr-(--side-panel-width)' : ''}`}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
      >
        <TopBar scrolled={scrolled} />
        <div key={entry.key} className={`@container/page min-h-full ${hasViewTransitions ? '' : 'animate-fade'} pt-(--titlebar-height) pb-[calc(var(--player-pill-height)+var(--player-bottom-offset)+48px)] pl-(--content-left)`}>
          <Suspense fallback={null}>
            <RoutePage route={entry.route} />
          </Suspense>
        </div>
      </main>
      {/* Content scrolling beneath the floating player fades out the same way. */}
      <div className={`scroll-edge-bottom pointer-events-none absolute bottom-0 left-0 z-10 h-[72px] ${sidePanel ? 'right-(--side-panel-width)' : 'right-0'}`} aria-hidden="true" />
      <SidePanel />
      <PlayerBar />
      </div>
      {fullScreen && (
        <Suspense fallback={null}>
          <FullScreenPlayer />
        </Suspense>
      )}
      <DialogLayer />
      <MenuLayer />
      <OfflinePill />
      <Toasts />
      <FirstRunGuide />
      <TastePicker />
      <UpdateDialog />
      <WhatsNew />
      <WindowControls />
    </div>
  );
}
