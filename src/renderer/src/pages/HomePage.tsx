import { Clock, Heart, Plus } from "lucide-react";
import { Mosaic } from "@/components/Mosaic";
import { useUi } from "@/state/ui";
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

/** Your playlists (and Liked Songs) as covers: open one, or play it from its cover. */
function YourPlaylists() {
  const playlists = useLibrary((s) => s.playlists);
  const liked = useLibrary((s) => s.liked);
  if (!playlists.length) return null;
  const cards = [
    ...(liked.length ? [{ key: "liked", name: "Liked Songs", tracks: liked, open: () => go({ name: "liked" }) as void }] : []),
    ...playlists.map((p) => ({ key: p.id, name: p.name, tracks: p.tracks, open: () => go({ name: "local", id: p.id }) as void })),
  ];
  return (
    <ShelfRow
      title="Your playlists"
      action={
        <button className="inline-flex items-center gap-1 type-body-emphasized text-secondary hover:text-primary" onClick={() => useUi.getState().openDialog({ kind: "new-playlist" })}>
          <Plus size={14} /> New
        </button>
      }
    >
      {cards.map((card) => (
        <div key={card.key} className="group w-[150px] flex-none snap-start">
          <div className="relative cursor-pointer" onClick={card.open}>
            {card.key === "liked" ? (
              <div className="grid size-[150px] place-items-center rounded-artwork-md bg-[linear-gradient(135deg,#5b2a86,#fa586a_60%,#f4a261)] text-white shadow-art">
                <Heart size={48} fill="currentColor" />
              </div>
            ) : (
              <Mosaic tracks={card.tracks} size={150} className="size-[150px] rounded-artwork-md shadow-art" />
            )}
            {card.tracks.length > 0 && (
              <button
                className="glass-prominent elastic absolute right-2 bottom-2 grid size-10 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Play ${card.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  usePlayer.getState().playTracks(card.tracks, 0, { source: { label: card.name } });
                }}
              >
                <PlayGlyph size={17} />
              </button>
            )}
          </div>
          <button className="mt-2 block w-full truncate text-left type-body-emphasized text-primary hover:underline" onClick={card.open}>
            {card.name}
          </button>
          <span className="block type-callout text-secondary">
            {card.tracks.length} {card.tracks.length === 1 ? "song" : "songs"}
          </span>
        </div>
      ))}
    </ShelfRow>
  );
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
  return (
    <div className="pt-4 pb-10">
      <h1 className="mb-6 px-(--body-gutter) type-header-emphasized">
        {greeting()}
      </h1>
      <GettingStarted />
      {/* Yours first: quick picks, your playlists, what you played, then what's made for you. */}
      <QuickTiles />
      <YourPlaylists />
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
      <MadeForYou />
      {/* Then the rest: YouTube Music's own shelves. */}
      <h2 className="mt-4 mb-1 px-(--body-gutter) type-[700_13px/16px] tracking-wide text-secondary uppercase">More to explore</h2>
      {isLoading &&
        Array.from({ length: 3 }, (_, i) => <ShelfSkeleton key={i} />)}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data?.shelves.map((shelf, i) => (
        <ShelfView key={`${shelf.title}-${i}`} shelf={shelf} />
      ))}
    </div>
  );
}
