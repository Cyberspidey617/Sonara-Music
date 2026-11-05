import { Clock, Heart } from "lucide-react";
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
import { openContextMenu } from "@/state/menu";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Quick tiles at the top of Home: Liked Songs and the last few things played. */
function QuickTiles() {
  const liked = useLibrary((s) => s.liked);
  const history = useLibrary((s) => s.history);
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
        ? () =>
            usePlayer
              .getState()
              .playTracks(liked, 0, { source: { label: "Liked Songs" } })
        : undefined,
    },
    ...history.slice(0, 7).map((t) => ({
      key: t.videoId,
      title: t.title,
      art: (
        <Artwork
          url={t.thumbnail}
          size={56}
          radius="sm"
          className="size-14 flex-none rounded-r-none"
        />
      ),
      open: () => usePlayer.getState().startRadio(t),
      play: () => usePlayer.getState().startRadio(t),
      menu: () => trackMenu(t, { fromHistory: true }),
    })),
  ];
  return (
    <div className="mb-10 grid grid-cols-1 gap-3 px-(--body-gutter) @min-[560px]/page:grid-cols-2 @min-[1080px]/page:grid-cols-3 @min-[1500px]/page:grid-cols-4">
      {tiles.map((tile, i) => (
        <div
          key={tile.key}
          style={{ "--i": i } as CSSProperties}
          className="group glow stagger relative flex h-14 cursor-pointer items-center gap-3 overflow-hidden rounded-[12px] bg-white/[0.07] pr-3 transition-[background-color,scale] duration-300 hover:bg-white/[0.12] active:scale-[0.98]"
          onClick={tile.open}
          onContextMenu={
            "menu" in tile ? (e) => openContextMenu(e, tile.menu()) : undefined
          }
        >
          {tile.art}
          <span className="min-w-0 flex-1 truncate type-title-3-emphasized">
            {tile.title}
          </span>
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

/** Shelves from your music taste (the picker after the guide; Settings › Playback). */
function MadeForYou() {
  const taste = useLibrary((s) => s.settings.taste);
  const { data, isLoading } = useMadeForYou(taste);
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
  const { data, error, isLoading, refetch } = useHome();
  const history = useLibrary((s) => s.history);
  return (
    <div className="pt-4 pb-10">
      <h1 className="mb-6 px-(--body-gutter) type-header-emphasized">
        {greeting()}
      </h1>
      <QuickTiles />
      <MadeForYou />
      {history.length > 8 && (
        <ShelfRow
          title="Recently Played"
          action={
            <button
              className="inline-flex items-center gap-1 type-body-emphasized text-secondary hover:text-primary"
              onClick={() => go({ name: "recent" })}
            >
              <Clock size={13} /> See All
            </button>
          }
        >
          {history.slice(0, 20).map((t) => (
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
      {isLoading &&
        Array.from({ length: 3 }, (_, i) => <ShelfSkeleton key={i} />)}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data?.shelves.map((shelf, i) => (
        <ShelfView key={`${shelf.title}-${i}`} shelf={shelf} />
      ))}
    </div>
  );
}
