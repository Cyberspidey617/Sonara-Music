import { Check, Loader2, Search } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { Lockup, Taste } from "@shared/types";
import { Artwork } from "@/components/Artwork";
import { api } from "@/lib/api";
import { GENRES, LANGUAGES, suggestArtists } from "@/lib/taste";
import { useLibrary } from "@/state/library";
import { toast } from "@/state/ui";

const STEPS = [
  {
    title: "What languages do you listen to?",
    hint: "Pick as many as you like.",
  },
  {
    title: "What kind of songs do you like?",
    hint: "Pick a few. You can change these any time in Settings.",
  },
  {
    title: "Choose artists you like",
    hint: "Suggested from your picks. Search for anyone else.",
  },
] as const;

const chip = (on: boolean) =>
  `inline-flex h-10 items-center gap-2 rounded-pill px-4 type-body-emphasized transition-[background-color,color,scale] duration-200 active:scale-95 ${on ? "bg-key text-white" : "bg-white/8 text-primary hover:bg-white/14"}`;

const toggle = <T,>(
  list: T[],
  item: T,
  same: (a: T, b: T) => boolean = (a, b) => a === b,
) =>
  list.some((x) => same(x, item))
    ? list.filter((x) => !same(x, item))
    : [...list, item];

/**
 * After the welcome guide (or from Settings): languages, kinds of songs and artists you like, as
 * Spotify asks, so Home can open with music made for you.
 */
export function TastePicker() {
  const guideSeen = useLibrary((s) => s.settings.guideSeen);
  const tasteSeen = useLibrary((s) => s.settings.tasteSeen);
  const saved = useLibrary((s) => s.settings.taste);
  const show = guideSeen && !tasteSeen;
  const [step, setStep] = useState(0);
  const [taste, setTaste] = useState<Taste>(saved);
  const [suggested, setSuggested] = useState<Lockup[] | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Lockup[] | null>(null);

  // Opening again (from Settings) starts from what you picked before.
  useEffect(() => {
    if (!show) return;
    setTaste(useLibrary.getState().settings.taste);
    setStep(0);
  }, [show]);

  // The artists step: suggestions from the languages and kinds picked.
  useEffect(() => {
    if (!show || step !== 2) return;
    let live = true;
    setSuggested(null);
    void suggestArtists(taste).then((a) => live && setSuggested(a));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, step, taste.languages.join(), taste.genres.join()]);

  // Searching for an artist that wasn't suggested.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return setFound(null);
    let live = true;
    const timer = setTimeout(
      () =>
        void api.search(q).then(
          (r) => live && setFound(r.artists.slice(0, 12)),
          () => live && setFound([]),
        ),
      300,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (!show) return null;

  const finish = (skipped: boolean) => {
    useLibrary
      .getState()
      .updateSettings({ taste: skipped ? saved : taste, tasteSeen: true });
    if (skipped)
      toast("You can pick your music taste any time in Settings › Playback.");
    else toast("Made for you is on Home");
  };
  const picked =
    step === 0
      ? taste.languages.length
      : step === 1
        ? taste.genres.length
        : taste.artists.length;
  // Artists you've picked come first (so any can be taken off, even when they're no longer suggested),
  // then the search results or suggestions.
  const listed = found ?? suggested;
  const mine: Lockup[] = found ? [] : taste.artists.map((a) => ({ kind: 'artist', id: a.id, title: a.name, ...(a.thumbnail && { thumbnail: a.thumbnail }) }));
  const artists = listed && [...mine, ...listed.filter((a) => !mine.some((m) => m.id === a.id))];
  const pickArtist = (a: Lockup) =>
    setTaste((t) => ({
      ...t,
      artists: toggle(
        t.artists,
        {
          id: a.id,
          name: a.title,
          ...(a.thumbnail && { thumbnail: a.thumbnail }),
        },
        (x, y) => x.id === y.id,
      ),
    }));

  return (
    <div
      className="fixed inset-0 z-[9600] grid animate-fade place-items-center bg-scrim p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Your music taste"
    >
      <div
        className="glass-thick relative flex max-h-[88vh] w-[min(760px,100%)] animate-menu-in flex-col overflow-hidden rounded-[28px]"
        style={{ backgroundColor: "var(--dialog-fill)" }}
      >
        <div className="flex items-center gap-1.5 px-8 pt-7" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${i === step ? "w-8 bg-key" : i < step ? "w-4 bg-key/60" : "w-4 bg-white/15"}`}
            />
          ))}
        </div>
        <div key={step} className="animate-fade-in px-8 pt-4 pb-2">
          <h2 className="type-[700_24px/30px] tracking-apple">
            {STEPS[step]!.title}
          </h2>
          <p className="mt-1 type-body-reduced text-secondary">
            {STEPS[step]!.hint}
          </p>
        </div>

        <div
          key={`body-${step}`}
          className="min-h-0 flex-1 animate-fade-in overflow-y-auto px-8 py-4"
        >
          {step === 0 && (
            <div className="flex flex-wrap gap-2.5">
              {LANGUAGES.map((l, i) => (
                <button
                  key={l}
                  className={`${chip(taste.languages.includes(l))} stagger`}
                  style={{ "--i": i } as CSSProperties}
                  aria-pressed={taste.languages.includes(l)}
                  onClick={() =>
                    setTaste((t) => ({
                      ...t,
                      languages: toggle(t.languages, l),
                    }))
                  }
                >
                  {taste.languages.includes(l) && (
                    <Check size={15} strokeWidth={2.6} />
                  )}{" "}
                  {l}
                </button>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="flex flex-wrap gap-2.5">
              {GENRES.map(({ label }, i) => (
                <button
                  key={label}
                  className={`${chip(taste.genres.includes(label))} stagger`}
                  style={{ "--i": i } as CSSProperties}
                  aria-pressed={taste.genres.includes(label)}
                  onClick={() =>
                    setTaste((t) => ({ ...t, genres: toggle(t.genres, label) }))
                  }
                >
                  {taste.genres.includes(label) && (
                    <Check size={15} strokeWidth={2.6} />
                  )}{" "}
                  {label}
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <>
              <label className="relative mb-5 block">
                <Search
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tertiary"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for an artist"
                  spellCheck={false}
                  className="h-10 w-full rounded-pill border-[0.5px] border-search-border bg-white/[0.07] pr-4 pl-9 type-body-reduced text-primary outline-none placeholder:text-tertiary focus:border-white/35"
                />
              </label>
              {!artists ? (
                <p className="flex items-center gap-2 py-10 type-callout text-secondary">
                  <Loader2 size={15} className="animate-spin" /> Finding artists
                  for you…
                </p>
              ) : !artists.length ? (
                <p className="py-10 type-callout text-tertiary">
                  No artists found.
                </p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-x-4 gap-y-5">
                  {artists.map((a, i) => {
                    const on = taste.artists.some((x) => x.id === a.id);
                    return (
                      <button
                        key={a.id}
                        className="group stagger flex flex-col items-center gap-2 text-center"
                        style={{ "--i": i } as CSSProperties}
                        aria-pressed={on}
                        onClick={() => pickArtist(a)}
                      >
                        <span
                          className={`relative rounded-full p-[3px] transition-[box-shadow,scale] duration-200 group-active:scale-95 ${on ? "shadow-[0_0_0_2.5px_var(--keyColor)]" : ""}`}
                        >
                          <Artwork
                            url={a.thumbnail}
                            size={96}
                            round
                            kind="artist"
                            className="size-24"
                          />
                          {on && (
                            <span className="absolute right-0.5 bottom-0.5 grid size-7 animate-glyph place-items-center rounded-full bg-key text-white shadow-[0_2px_8px_rgb(0_0_0/0.4)]">
                              <Check size={15} strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span className="line-clamp-2 type-callout-emphasized text-primary">
                          {a.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/8 px-8 py-5">
          <button
            className="h-9 rounded-pill px-4 type-body-emphasized text-secondary hover:text-primary"
            onClick={() => finish(true)}
          >
            Skip
          </button>
          <span className="mr-auto type-callout text-tertiary">
            {picked ? `${picked} picked` : ""}
          </span>
          {step > 0 && (
            <button
              className="h-9 rounded-pill bg-white/10 px-5 type-body-emphasized hover:bg-white/15"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          )}
          <button
            className="h-9 rounded-pill bg-pill-bg px-5 type-body-emphasized text-pill hover:bg-white"
            onClick={() => (step < 2 ? setStep((s) => s + 1) : finish(false))}
          >
            {step < 2 ? "Next" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
