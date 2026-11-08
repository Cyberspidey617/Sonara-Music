import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Track, Wrapped } from '@shared/types';
import { Artwork } from '@/components/Artwork';
import { PillButton } from '@/components/Buttons';
import { PlayGlyph } from '@/components/icons';
import { Page } from '@/components/Page';
import { EmptyState } from '@/components/States';
import { api } from '@/lib/api';
import { go } from '@/state/nav';
import { usePlayer } from '@/state/player';

const monthName = (month: string, withYear = false) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', ...(withYear && { year: 'numeric' }) });
};
const thisYear = (month: string) => month.startsWith(String(new Date().getFullYear()));
const n = (v: number) => v.toLocaleString();

/** What your listening hours say about you. */
function listener(hours: number[]): { title: string; body: string } {
  const peak = hours.indexOf(Math.max(...hours));
  const clock = new Date(2000, 0, 1, peak).toLocaleTimeString(undefined, { hour: 'numeric' });
  if (peak >= 22 || peak <= 3) return { title: 'Night owl', body: `Your music peaks around ${clock}, when everyone else is asleep.` };
  if (peak <= 9) return { title: 'Early riser', body: `You start the day with music: most of it around ${clock}.` };
  if (peak <= 16) return { title: 'Daytime listener', body: `Music keeps your day going, most of all around ${clock}.` };
  return { title: 'Evening unwinder', body: `Evenings are for music: you listen most around ${clock}.` };
}

function play(tracks: Track[], label: string, start = 0) {
  if (tracks.length) usePlayer.getState().playTracks(tracks, start, { source: { label } });
}

function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={`stagger rounded-[24px] bg-white/[0.055] p-6 ring-1 ring-white/8 ring-inset ${className}`} style={style}>
      {children}
    </section>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => <div className="type-footnote font-bold tracking-[0.14em] text-key uppercase">{children}</div>;

export function WrappedPage({ month }: { month?: string }) {
  const [data, setData] = useState<Wrapped | null>(null);
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    let alive = true;
    void api.wrapped(month).then((w) => alive && setData(w));
    return () => {
      alive = false;
    };
  }, [month, polls]);
  // Genres arrive a few seconds apart (one lookup each): ask again until they're all in.
  useEffect(() => {
    if (!data?.genresPending || polls > 40) return;
    const timer = setTimeout(() => setPolls((p) => p + 1), 5000);
    return () => clearTimeout(timer);
  }, [data, polls]);

  if (!data) return <div className="grid h-[60vh] place-items-center text-tertiary"><Loader2 className="animate-spin" /></div>;

  const at = data.months.indexOf(data.month);
  const older = data.months[at + 1];
  const newer = at > 0 ? data.months[at - 1] : undefined;
  const name = monthName(data.month, !thisYear(data.month));
  const top = data.topSongs[0];
  const tracks = data.topSongs.map((s) => s.track);
  const label = `Your ${monthName(data.month)} top songs`;

  return (
    <Page tintUrl={top?.track.thumbnail}>
      <div className="mx-auto max-w-[1100px] px-(--body-gutter) pt-6 pb-16">
        <header className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 type-footnote font-bold tracking-[0.18em] text-secondary uppercase">
              <Sparkles size={14} className="text-key" /> Wrapped
            </div>
            <h1 className="mt-1 type-[800_clamp(34px,5cqw,56px)/1.05] tracking-tight text-primary">
              Your {name}
              {data.partial && <span className="text-tertiary"> so far</span>}
            </h1>
          </div>
          <div className="glass flex items-center gap-0.5 rounded-pill p-[3px]">
            <button className="grid size-8 place-items-center rounded-full text-secondary hover:bg-white/12 hover:text-primary disabled:opacity-30" disabled={!older} aria-label="Earlier month" onClick={() => older && go({ name: 'wrapped', month: older })}>
              <ChevronLeft size={17} />
            </button>
            <span className="min-w-[96px] text-center type-callout-emphasized text-primary">{monthName(data.month, true)}</span>
            <button className="grid size-8 place-items-center rounded-full text-secondary hover:bg-white/12 hover:text-primary disabled:opacity-30" disabled={!newer} aria-label="Later month" onClick={() => newer && go({ name: 'wrapped', month: newer })}>
              <ChevronRight size={17} />
            </button>
          </div>
          {tracks.length > 0 && (
            <PillButton onClick={() => play(tracks, label)}>
              <PlayGlyph size={15} /> Play your top songs
            </PillButton>
          )}
        </header>

        {data.plays === 0 ? (
          <div className="mt-16">
            <EmptyState
              icon={<Sparkles size={36} strokeWidth={1.5} />}
              title={data.partial ? 'Your month starts here' : `Nothing played in ${name}`}
              body="Songs count once you’ve listened for 30 seconds. Come back after a few to see your top songs, artists and sound."
            />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-6 gap-4">
            {/* The big numbers. */}
            <Card
              className="relative col-span-6 overflow-hidden @min-[860px]/page:col-span-3"
              style={{ '--i': 0, background: 'linear-gradient(135deg, color-mix(in srgb, var(--keyColor) 70%, #000), color-mix(in srgb, var(--keyColor) 25%, #000))' } as CSSProperties}
            >
              <div className="type-callout-emphasized text-white/80">You listened for</div>
              <div className="mt-1 type-[800_clamp(56px,8cqw,88px)/1] tracking-tight text-white tabular-nums">{n(data.minutes)}</div>
              <div className="mt-1 type-title-2-emphasized text-white/90">minutes{data.minutes >= 120 && <span className="text-white/60"> · {n(Math.round(data.minutes / 60))} hours</span>}</div>
              <Sparkles size={140} strokeWidth={0.8} className="pointer-events-none absolute -right-6 -bottom-8 text-white/10" />
            </Card>
            {[
              ['Listens', data.plays],
              ['Different songs', data.songs],
              ['Artists', data.artists],
            ].map(([what, value], i) => (
              <Card key={what} className="col-span-2 flex flex-col justify-end @min-[860px]/page:col-span-1" style={{ '--i': i + 1 } as CSSProperties}>
                <div className="type-[800_40px/1] tracking-tight text-primary tabular-nums">{n(value as number)}</div>
                <div className="mt-2 type-callout text-secondary">{what}</div>
              </Card>
            ))}

            {/* Your number one. */}
            {top && (
              <Card className="col-span-6 flex items-center gap-6" style={{ '--i': 4 } as CSSProperties}>
                <button className="group relative flex-none" aria-label={`Play ${top.track.title}`} onClick={() => play(tracks, label, 0)}>
                  <Artwork url={top.track.thumbnail} size={200} radius="lg" className="size-[200px] shadow-art" />
                  <span className="absolute inset-0 grid place-items-center rounded-artwork-lg bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                    <PlayGlyph size={40} className="text-white" />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <Eyebrow>Your top song</Eyebrow>
                  <div className="mt-2 line-clamp-2 type-[800_clamp(28px,4cqw,44px)/1.1] tracking-tight text-primary">{top.track.title}</div>
                  <div className="mt-1 truncate type-title-3 text-secondary">{top.track.artists.map((a) => a.name).join(', ')}</div>
                  <div className="mt-4 type-body-emphasized text-primary">
                    {n(top.plays)} {top.plays === 1 ? 'listen' : 'listens'} <span className="text-tertiary">· {n(top.minutes)} minutes</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Top songs and artists. */}
            <Card className="col-span-6 @min-[860px]/page:col-span-3" style={{ '--i': 5 } as CSSProperties}>
              <Eyebrow>Top songs</Eyebrow>
              <ol className="mt-4 space-y-1">
                {data.topSongs.slice(0, 5).map((song, i) => (
                  <li key={song.track.videoId}>
                    <button className="flex w-full items-center gap-3 rounded-[12px] p-1.5 text-left hover:bg-white/6" onClick={() => play(tracks, label, i)}>
                      <span className="w-6 text-center type-title-2-emphasized text-tertiary tabular-nums">{i + 1}</span>
                      <Artwork url={song.track.thumbnail} size={48} radius="sm" className="size-12 flex-none" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate type-body-emphasized text-primary">{song.track.title}</span>
                        <span className="block truncate type-callout text-secondary">{song.track.artists.map((a) => a.name).join(', ')}</span>
                      </span>
                      <span className="flex-none type-callout text-tertiary tabular-nums">{n(song.plays)}×</span>
                    </button>
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="col-span-6 @min-[860px]/page:col-span-3" style={{ '--i': 6 } as CSSProperties}>
              <Eyebrow>Top artists</Eyebrow>
              <ol className="mt-4 space-y-1">
                {data.topArtists.slice(0, 5).map((artist, i) => (
                  <li key={artist.id ?? artist.name}>
                    <button
                      className="flex w-full items-center gap-3 rounded-[12px] p-1.5 text-left hover:bg-white/6 disabled:hover:bg-transparent"
                      disabled={!artist.id}
                      onClick={() => artist.id && go({ name: 'artist', id: artist.id })}
                    >
                      <span className="w-6 text-center type-title-2-emphasized text-tertiary tabular-nums">{i + 1}</span>
                      <Artwork url={artist.thumbnail} size={48} round kind="artist" className="size-12 flex-none" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate type-body-emphasized text-primary">{artist.name}</span>
                        <span className="block truncate type-callout text-secondary">{n(artist.minutes)} minutes</span>
                      </span>
                      <span className="flex-none type-callout text-tertiary tabular-nums">{n(artist.plays)}×</span>
                    </button>
                  </li>
                ))}
              </ol>
            </Card>

            {/* Your sound. */}
            <Card className="col-span-6 @min-[860px]/page:col-span-3" style={{ '--i': 7 } as CSSProperties}>
              <Eyebrow>Your sound</Eyebrow>
              {data.genres.length ? (
                <>
                  <div className="mt-2 type-title-2-emphasized text-primary">Mostly {data.genres[0]!.name}</div>
                  <ul className="mt-4 space-y-3">
                    {data.genres.slice(0, 6).map((g, i) => (
                      <li key={g.name}>
                        <div className="flex items-baseline justify-between type-callout">
                          <span className="text-primary">{g.name}</span>
                          <span className="text-tertiary tabular-nums">{Math.round(g.share * 100)}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/8">
                          <div className="h-full rounded-full bg-key" style={{ width: `${Math.max(3, g.share * 100)}%`, opacity: 1 - i * 0.13 }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="mt-3 type-callout text-tertiary">{data.genresPending ? 'Finding the genres of your songs…' : 'No genres found for these songs.'}</div>
              )}
              {data.genres.length > 0 && data.genresPending > 0 && (
                <div className="mt-4 flex items-center gap-2 type-footnote text-tertiary">
                  <Loader2 size={12} className="animate-spin" /> Still finding genres for {n(data.genresPending)} {data.genresPending === 1 ? 'song' : 'songs'}
                </div>
              )}
            </Card>

            {/* When you listen. */}
            <Card className="col-span-6 @min-[860px]/page:col-span-3" style={{ '--i': 8 } as CSSProperties}>
              <Eyebrow>When you listen</Eyebrow>
              {(() => {
                const you = listener(data.hours);
                const most = Math.max(1, ...data.hours);
                return (
                  <>
                    <div className="mt-2 type-title-2-emphasized text-primary">{you.title}</div>
                    <div className="mt-1 type-callout text-secondary">{you.body}</div>
                    <div className="mt-5 flex h-24 items-end gap-[3px]" aria-label="Listens by hour of the day">
                      {data.hours.map((count, h) => (
                        <div
                          key={h}
                          className="flex-1 rounded-t-[3px] bg-key transition-[height] duration-500"
                          style={{ height: `${Math.max(4, (count / most) * 100)}%`, opacity: count ? 0.35 + (0.65 * count) / most : 0.12 }}
                          title={`${new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}: ${count} ${count === 1 ? 'listen' : 'listens'}`}
                        />
                      ))}
                    </div>
                    <div className="mt-1.5 flex justify-between type-footnote text-tertiary">
                      {[0, 6, 12, 18, 23].map((h) => (
                        <span key={h}>{new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}</span>
                      ))}
                    </div>
                    {data.topDay && (
                      <div className="mt-4 type-callout text-secondary">
                        Your biggest day:{' '}
                        <span className="text-primary">
                          {new Date(Number(data.month.slice(0, 4)), Number(data.month.slice(5)) - 1, data.topDay.day).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
                        </span>
                        , {n(data.topDay.minutes)} minutes
                      </div>
                    )}
                  </>
                );
              })()}
            </Card>
          </div>
        )}
      </div>
    </Page>
  );
}
