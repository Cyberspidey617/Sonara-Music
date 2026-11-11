import { Clock, Heart } from "lucide-react";
import type { Shelf as ShelfData } from "@shared/types";
import { Mosaic } from "@/components/Mosaic";
import { GettingStarted } from '@/components/GettingStarted';
import type { CSSProperties } from "react";
import { useLibrary } from "@/state/library";
import { go } from "@/state/nav";
import { usePlayer } from "@/state/player";
import { useHome, useMadeForYou } from "@/lib/queries";
import { Artwork } from "@/components/Artwork";
import { PlayGlyph } from "@/components/icons";
import { ShelfRow, ShelfView } from "@/components/Shelf";
import { ErrorState, ShelfSkeleton } from "@/components/States";
import { Lockup } from "@/components/Lockup";
import { trackMenu } from "@/components/trackActions";
import { openContextMenu, type MenuEntry } from "@/state/menu";
import { useOnline } from "@/state/online";
import { OfflineHome } from "./OfflineHome";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** How many of your latest songs the quick picks show (Recently played carries on after them). */
const QUICK_SONGS = 5;

/**
 * Quick picks, the first thing on Home: Liked Songs, your playlists and your latest songs, each one
 * click away (the play button plays it; the tile opens it).
 */
function QuickTiles() {
  const liked = useLibrary((s) => s.liked);
  const history = useLibrary((s) => s.history);
  const playlists = useLibrary((s) => s.playlists);
  const tiles = [
    {
      key: "liked",
      title: "Liked Songs",
      art: (
        <div className="grid size-14 flex-none place-items-center rounded-l-[8px] bg-[linear-gradient(135deg,#5b2a86,#fa586a_60%,#f4a261)] text-white">
          <Heart size={22} fill="currentColor" />
        </div>
      ),
      open: () => go({ name: "liked" }),
      play: liked.length
        ? () => usePlayer.getState().playTracks(liked, 0, { source: { label: "Liked Songs" } })
        : undefined,
    },
    ...playlists.slice(0, 3).map((p) => ({
      key: `playlist-${p.id}`,
      title: p.name,
      art: <Mosaic tracks={p.tracks} size={56} className="size-14 flex-none rounded-none" />,
      open: () => go({ name: "local", id: p.id }),
      play: p.tracks.length ? () => usePlayer.getState().playTracks(p.tracks, 0, { source: { label: p.name } }) : undefined,
    })),
    ...history.slice(0, QUICK_SONGS + 3 - Math.min(3, playlists.length)).map((t) => ({
      key: t.videoId,
      title: t.title,
      art: <Artwork url={t.thumbnail} size={56} radius="sm" className="size-14 flex-none rounded-r-none" />,
      open: () => usePlayer.getState().startRadio(t),
      play: () => usePlayer.getState().startRadio(t),
      menu: () => trackMenu(t, { fromHistory: true }),
    })),
  ].slice(0, 8);
  return (
    <div className="mb-10 grid grid-cols-1 gap-3 px-(--body-gutter) @min-[560px]/page:grid-cols-2 @min-[1080px]/page:grid-cols-3 @min-[1500px]/page:grid-cols-4">
      {tiles.map((tile, i) => (
        <div
          key={tile.key}
          style={{ "--i": i } as CSSProperties}
          className="group glow stagger relative flex h-14 cursor-pointer items-center gap-3 overflow-hidden rounded-[12px] bg-white/[0.07] pr-3 transition-[background-color,scale] duration-300 hover:bg-white/[0.12] active:scale-[0.98]"
          onClick={tile.open}
          onContextMenu={(e) => {
            const menu = (tile as { menu?: () => MenuEntry[] }).menu;
            if (menu) openContextMenu(e, menu());
          }}
        >
          {tile.art}
          <span className="min-w-0 flex-1 truncate type-title-3-emphasized">{tile.title}</span>
          {tile.play && (
            <button
              className="glass-prominent elastic relative grid size-8 flex-none place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={`Play ${tile.title}`}
              onClick={(e) => {
                e.stopPropagation();
                tile.play!();
              }}
            >
              <PlayGlyph size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * YouTube Music's Home shelves, sorted for Home's order: Quick picks; what's trending (charts, top
 * songs, new releases); playlist shelves (moods, mixes, community playlists), kept for the bottom;
 * and the rest in between, each in YouTube Music's own order.
 */
function groupShelves(shelves: ShelfData[]) {
  const quick: ShelfData[] = [];
  const trending: ShelfData[] = [];
  const playlists: ShelfData[] = [];
  const rest: ShelfData[] = [];
  for (const shelf of shelves) {
    const playlistShare = shelf.items.length ? shelf.items.filter((i) => i.kind === 'playlist').length / shelf.items.length : 0;
    if (/quick picks/i.test(shelf.title)) quick.push(shelf);
    else if (/trend|chart|top \d+|top songs|hits|new release|viral/i.test(shelf.title) && playlistShare < 0.5) trending.push(shelf);
    else if (playlistShare >= 0.5) playlists.push(shelf);
    else rest.push(shelf);
  }
  return { quick, trending, playlists, rest };
}

/** Shelves from your music taste (the picker after the guide; Settings › Playback). */
function MadeForYou() {
  const taste = useLibrary((s) => s.settings.taste);
  const notInterested = useLibrary((s) => s.settings.notInterested ?? []);
  const notInterestedArtists = useLibrary((s) => s.settings.notInterestedArtists ?? []);
  const tasteExcluded = useLibrary((s) => s.settings.tasteExcluded ?? []);
  const notes = useLibrary((s) => s.settings.tasteNotes ?? []);
  const { data, isLoading } = useMadeForYou(taste, { notInterested, notInterestedArtists, tasteExcluded, notes });
  if (isLoading) return <ShelfSkeleton />;
  if (!data?.length) return null;
  return (
    <>
      <h2 className="mb-1 px-(--body-gutter) type-[700_13px/16px] tracking-wide text-key uppercase">
        Made for you
      </h2>
      {data.map((shelf, i) => (
        <ShelfView key={`${shelf.title}-${i}`} shelf={shelf} />
      ))}
    </>
  );
}

export function HomePage() {
  const online = useOnline((s) => s.online);
  return online ? <OnlineHome /> : <OfflineHome />;
}

function OnlineHome() {
  const { data, error, isLoading, refetch } = useHome();
  const history = useLibrary((s) => s.history);
  // Recently played carries on after the songs the quick picks already show.
  const shownAbove = new Set(history.slice(0, QUICK_SONGS + 3).map((t) => t.videoId));
  const recent = history.filter((t) => !shownAbove.has(t.videoId)).slice(0, 20);
  const hideVideos = useLibrary((s) => s.settings.hideVideos);
  const shelves = (data?.shelves ?? []).map((s) => (hideVideos ? { ...s, items: s.items.filter((l) => l.kind !== 'video' && !l.track?.isVideo) } : s)).filter((s) => s.items.length);
  const groups = groupShelves(shelves);
  return (
    <div className="pt-4 pb-10">
      <h1 className="mb-6 px-(--body-gutter) type-header-emphasized">
        {greeting()}
      </h1>
      <GettingStarted />
      {/* Yours first, then the rest: your quick tiles, Quick picks, what you played, what's trending,
          what's made for you, YouTube Music's other shelves, and its playlists at the bottom. */}
      <QuickTiles />
      {groups.quick.map((shelf, i) => (
        <ShelfView key={`quick-${i}`} shelf={shelf} />
      ))}
      {isLoading && <ShelfSkeleton />}
      {recent.length > 0 && (
        <ShelfRow
          title="Recently played"
          action={
            <button
              className="inline-flex items-center gap-1 type-body-emphasized text-secondary hover:text-primary"
              onClick={() => go({ name: "recent" })}
            >
              <Clock size={13} /> See All
            </button>
          }
        >
          {recent.map((t) => (
            <div key={t.videoId} className="flex-none snap-start">
              <Lockup
                lockup={{
                  kind: "song",
                  id: t.videoId,
                  title: t.title,
                  subtitle: t.artists.map((a) => a.name).join(", "),
                  thumbnail: t.thumbnail,
                  track: t,
                }}
                size={150}
                fromHistory
              />
            </div>
          ))}
        </ShelfRow>
      )}
      {groups.trending.map((shelf, i) => (
        <ShelfView key={`trending-${i}`} shelf={shelf} />
      ))}
      <MadeForYou />
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {(groups.rest.length > 0 || groups.playlists.length > 0) && (
        <h2 className="mt-4 mb-1 px-(--body-gutter) type-[700_13px/16px] tracking-wide text-secondary uppercase">More to explore</h2>
      )}
      {groups.rest.map((shelf, i) => (
        <ShelfView key={`rest-${shelf.title}-${i}`} shelf={shelf} />
      ))}
      {groups.playlists.map((shelf, i) => (
        <ShelfView key={`playlists-${shelf.title}-${i}`} shelf={shelf} />
      ))}
    </div>
  );
}
