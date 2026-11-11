import { useDownloads } from '@/state/downloads';
import { Clock, Compass, Download, HardDrive, HardDriveDownload, Heart, House, ListMusic, Plus, Search, Settings, Sparkles, VenetianMask } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLiquidLens } from '@/lib/glass';
import { useLibrary } from '@/state/library';
import { openContextMenu } from '@/state/menu';
import { go, useNav, type Route } from '@/state/nav';
import { usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';
import { LogoMark } from '@/components/icons';
import { Mosaic } from '@/components/Mosaic';

const item = 'group relative isolate flex h-9 w-full items-center gap-2.5 mb-0.5 px-2.5 rounded-nav type-body-reduced text-primary transition-[background-color,scale] duration-200 hover:bg-white/[0.07] aria-[current=page]:hover:bg-transparent active:scale-[0.98] aria-[current=page]:font-semibold';

/** The selection: one piece of glass that slides between items when you navigate (a view transition). */
function Selection() {
  return <span aria-hidden="true" className="absolute inset-0 -z-1 rounded-nav bg-nav-selected shadow-[inset_0_0.5px_0_rgb(255_255_255/0.12)]" style={{ viewTransitionName: 'nav-selection' }} />;
}
/** Labels fade and slide in as the rail opens. */
const label_ = 'min-w-0 truncate transition-[opacity,translate] duration-300 ease-(--ease-out-panel) group-data-[collapsed]/nav:pointer-events-none group-data-[collapsed]/nav:-translate-x-1 group-data-[collapsed]/nav:opacity-0';
const iconBox = 'inline-grid size-6 flex-none place-items-center text-secondary group-aria-[current=page]:text-key';
/** The opened sidebar's frosting: the thick glass, blurred 1.6× more (the Glass blur setting still scales it). */
const FROSTED_FILTER = 'blur(calc(var(--glass-blur-thick) * 1.6)) saturate(var(--glass-saturate)) brightness(1.04)';
const FROSTED: CSSProperties = { backdropFilter: FROSTED_FILTER, WebkitBackdropFilter: FROSTED_FILTER };

function NavItem({ route, label, icon, active }: { route: Route; label: string; icon: ReactNode; active: boolean }) {
  return (
    <button className={item} aria-current={active ? 'page' : undefined} title={label} onClick={() => go(route)}>
      {active && <Selection />}
      <span className={iconBox}>{icon}</span>
      <span className={label_}>{label}</span>
    </button>
  );
}

/** Incognito on or off: while on, nothing you play is kept or learned from. */
function IncognitoItem() {
  const on = useLibrary((s) => !!s.settings.incognito);
  const label = on ? 'Incognito is on' : 'Incognito';
  return (
    <button
      className={`${item} ${on ? 'text-key' : ''}`}
      aria-pressed={on}
      title={on ? 'Incognito is on: nothing you play is kept or shapes your recommendations. Click to turn it off.' : 'Incognito: play without keeping history, Wrapped plays, scrobbles or recommendations'}
      onClick={() => {
        useLibrary.getState().updateSettings({ incognito: !on });
        toast(on ? 'Incognito off: your listening is kept again' : 'Incognito on: nothing you play is kept');
      }}
    >
      {on && <span className="absolute inset-0 -z-10 rounded-[inherit] bg-key/15" />}
      <span className={iconBox}>
        <VenetianMask size={17} strokeWidth={2} />
      </span>
      <span className={label_}>{label}</span>
    </button>
  );
}

export function Sidebar() {
  const route = useNav((s) => s.stack[s.index]!.route);
  const playlists = useLibrary((s) => s.playlists);
  const likedCount = useLibrary((s) => s.liked.length);
  const openDialog = useUi((s) => s.openDialog);
  const showSearch = useLibrary((s) => s.settings.sidebarSearch);
  const showRecent = useLibrary((s) => s.settings.sidebarRecent);
  const showMusic = useLibrary((s) => s.settings.sidebarMusic);
  const is = (name: Route['name'], id?: string) => route.name === name && (id === undefined || ('id' in route && route.id === id));
  const mode = useLibrary((s) => s.settings.sidebarMode ?? 'compact');
  const activeDownloads = useDownloads((s) => s.list.filter((d) => d.state === 'queued' || d.state === 'downloading').length);
  // Compact: an icon rail that opens as a pane of glass over the page while the pointer
  // is on it (after a short pause, so passing over it doesn't flash it open).
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intent = (open: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(open), open ? 140 : 260);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  // After you pick something it closes, and stays closed until the pointer leaves and comes back.
  const [picked, setPicked] = useState(false);
  const expanded = mode === 'expanded' || ((hover || focused) && !picked);
  // Collapsed, the rail is the same liquid glass as the pebble player (refraction at its rim);
  // opened, it frosts over, blurring the page behind it more.
  const nav = useRef<HTMLElement>(null);
  const lens = useLiquidLens(nav, { band: 20, strength: 44, blur: 18, key: expanded });
  const glassStyle = expanded ? FROSTED : lens;
  const header = (text: string) => (
    <div className="relative mt-5 h-7">
      <h2 className={`absolute inset-x-0 top-0 px-2.5 py-1 type-callout-emphasized whitespace-nowrap text-tertiary transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`}>{text}</h2>
      <span className={`absolute top-1/2 left-3 h-px w-5 bg-white/15 transition-opacity duration-200 ${expanded ? 'opacity-0' : 'opacity-100'}`} />
    </div>
  );

  return (
    // A pane of glass floating above the content, inset from the window's edges.
    <nav
      ref={nav}
      style={glassStyle}
      className={`group/nav ${expanded ? 'glass-thick' : 'glass'} absolute top-(--inset) bottom-(--inset) left-(--inset) z-[45] flex flex-col overflow-hidden rounded-panel transition-[width,box-shadow] duration-[450ms] ease-(--ease-out-panel) ${expanded ? 'w-(--nav-width)' : 'w-(--nav-rail)'} ${mode === 'compact' && expanded ? 'shadow-[0_24px_70px_rgb(0_0_0/0.55),0_2px_8px_rgb(0_0_0/0.3)]' : ''}`}
      data-collapsed={expanded ? undefined : ''}
      aria-label="Main"
      onPointerEnter={() => mode === 'compact' && intent(true)}
      onPointerLeave={(e) => {
        // A view transition briefly covers the page, which reads as "leaving"; only a pointer
        // that's really outside counts.
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
        if (picked) {
          // Closed by a pick: stay closed (re-opening under the pointer would trap it open).
          if (timer.current) clearTimeout(timer.current);
          setHover(false);
          setPicked(false);
        } else if (mode === 'compact') intent(false);
      }}
      onClickCapture={(e) => {
        if (mode !== 'compact' || !(e.target as Element).closest('button')) return;
        setPicked(true);
        (document.activeElement as HTMLElement | null)?.blur();
        setFocused(false);
      }}
      // Keyboard focus opens it too (not mouse clicks, which already hover it).
      onFocus={(e) => (e.target as Element).matches(':focus-visible') && setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocused(false)}
    >
      {/* On macOS the traffic lights sit above the logo. */}
      <div className="app-drag flex h-[60px] flex-none items-end px-[18px] pb-3 [[data-platform=mac]_&]:h-[84px]">
        <button className="app-no-drag inline-flex items-center gap-2" onClick={() => go({ name: 'home' })} aria-label="Sonara, Home">
          <LogoMark size={24} className="flex-none text-key transition-colors duration-500" />
          <span className={`type-[700_19px/24px] tracking-[0.12em] ${label_}`}>SONARA</span>
        </button>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pt-2">
        <NavItem route={{ name: 'home' }} label="Home" icon={<House size={18} strokeWidth={2} />} active={is('home')} />
        {showSearch && <NavItem route={{ name: 'search', q: '' }} label="Search" icon={<Search size={18} strokeWidth={2} />} active={is('search')} />}
        <NavItem route={{ name: 'moods' }} label="Genres & Moods" icon={<Compass size={18} strokeWidth={2} />} active={is('moods') || is('mood')} />

        {header('Library')}
        <NavItem route={{ name: 'liked' }} label={`Liked Songs${likedCount ? ` · ${likedCount}` : ''}`} icon={<Heart size={17} strokeWidth={2} />} active={is('liked')} />
        {showMusic && <NavItem route={{ name: 'music' }} label="Your Music" icon={<HardDrive size={17} strokeWidth={2} />} active={is('music') || is('musicAlbum')} />}
        <NavItem route={{ name: 'downloads' }} label={`Downloads${activeDownloads ? ` · ${activeDownloads}` : ''}`} icon={<HardDriveDownload size={17} strokeWidth={2} />} active={is('downloads')} />
        {showRecent && <NavItem route={{ name: 'recent' }} label="Recently Played" icon={<Clock size={17} strokeWidth={2} />} active={is('recent')} />}
        <NavItem route={{ name: 'wrapped' }} label="Wrapped" icon={<Sparkles size={17} strokeWidth={2} />} active={is('wrapped')} />

        <div className="relative">
          {header('Playlists')}
          <div className={`absolute top-0 right-1.5 flex h-7 items-center gap-0.5 transition-opacity duration-200 ${expanded ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            <button className="grid size-6 place-items-center rounded-[5px] text-secondary hover:bg-quinary hover:text-primary" title="Import a YouTube or Spotify playlist" aria-label="Import a YouTube or Spotify playlist" onClick={() => openDialog({ kind: 'import' })}>
              <Download size={14} strokeWidth={2.2} />
            </button>
            <button className="grid size-6 place-items-center rounded-[5px] text-secondary hover:bg-quinary hover:text-primary" title="New playlist" aria-label="New playlist" onClick={() => openDialog({ kind: 'new-playlist' })}>
              <Plus size={16} strokeWidth={2.2} />
            </button>
          </div>
        </div>
        {playlists.length === 0 && (
          <button className={`${item} text-secondary`} onClick={() => openDialog({ kind: 'new-playlist' })}>
            <span className={iconBox}>
              <ListMusic size={17} />
            </span>
            <span className={label_}>New Playlist</span>
          </button>
        )}
        {playlists.map((p) => (
          <button
            key={p.id}
            className={item}
            aria-current={is('local', p.id) ? 'page' : undefined}
            title={p.name}
            onClick={() => go({ name: 'local', id: p.id })}
            onContextMenu={(e) =>
              openContextMenu(e, [
                { header: p.name },
                { label: 'Play', disabled: !p.tracks.length, onSelect: () => usePlayer.getState().playTracks(p.tracks, 0, { source: { label: p.name } }) },
                { label: 'Shuffle', disabled: !p.tracks.length, onSelect: () => usePlayer.getState().playTracks(p.tracks, 0, { shuffle: true, source: { label: p.name } }) },
                { label: 'Rename…', onSelect: () => openDialog({ kind: 'rename-playlist', id: p.id }) },
                { separator: true },
                {
                  label: 'Delete',
                  destructive: true,
                  onSelect: () => {
                    useLibrary.getState().deletePlaylist(p.id);
                    if (is('local', p.id)) go({ name: 'home' });
                    toast(`Deleted “${p.name}”`, { label: 'Undo', run: () => useLibrary.getState().createPlaylist(p.name, p.tracks, p.sourceId) });
                  },
                },
              ])
            }
          >
            {is('local', p.id) && <Selection />}
            <Mosaic tracks={p.tracks} size={24} className="flex-none rounded-[4px]" />
            <span className={label_}>{p.name}</span>
          </button>
        ))}
      </div>
      <div className="flex-none px-2 pt-2 pb-2">
        <IncognitoItem />
        <NavItem route={{ name: 'settings' }} label="Settings" icon={<Settings size={17} strokeWidth={2} />} active={is('settings')} />
      </div>
    </nav>
  );
}
