import { ListMusic, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  MINI_SIZES,
  type MiniGrow,
  type MiniLayout,
  type PlaybackState,
} from "@shared/types";
import { api } from "@/lib/api";
import {
  LogoMark,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
} from "@/components/icons";

const control =
  "grid size-9 flex-none place-items-center rounded-full text-primary transition-[background-color,scale] duration-200 hover:bg-white/10 active:scale-90 disabled:opacity-35 aria-pressed:bg-white/15";
/** The window keeps the Up Next size (see main/mini.ts), so opening and closing it is the pill's alone. */
const fixed = new URLSearchParams(location.search).has("fixed");
/**
 * Where the window can't keep that size (Linux), it's dragged by the system instead: Wayland lets
 * no app place its own window or read the cursor outside it, so the page's own drag can't work.
 */
const systemDrag = !fixed;
/** The window's see-through margin around the pill. */
const INSET = 8;
/** The pill's height as the bar, and with Up Next open. */
const BAR = MINI_SIZES.bar.height - INSET * 2;
const OPEN = MINI_SIZES.queue.height - INSET * 2;
/** Up Next opening and closing: a soft spring-like ease, long enough to follow. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const RESIZE_MS = 420;
/** Parts of the player that are pressed rather than dragged or double-clicked. */
const interactive = (target: EventTarget) =>
  target instanceof Element &&
  !!target.closest("button, [data-seek], [data-list]");

/**
 * The mini player: its own small window, on top of other apps. It mirrors what the main window
 * reports and sends its buttons back there. The page drags it itself, so a double-click anywhere
 * that isn't a button can open Sonara.
 *
 * Up Next: the pill takes its full height at once but is clipped to the bar, then the clip opens
 * (and closes again). Only the clip moves, so nothing is laid out again frame by frame. Where the
 * window can't stay that size (Linux), it takes the full size first and gives it back afterwards.
 * Appearing and going are the window's own fades (main/mini.ts).
 */
export function MiniPlayer() {
  const [state, setState] = useState<PlaybackState & { at: number }>({
    playing: false,
    at: performance.now(),
  });
  const [layout, setLayout] = useState<MiniLayout>("bar");
  const [grow, setGrow] = useState<MiniGrow>("up");
  const [expanded, setExpanded] = useState(false);
  // Whether the clip animates: not at the moment the pill swaps its height (opening and once closed).
  const [animate, setAnimate] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      api.onMiniState((next, nextLayout, nextGrow) => {
        setState({ ...next, at: performance.now() });
        if (nextLayout) setLayout(nextLayout);
        if (nextGrow) setGrow(nextGrow);
      }),
    [],
  );

  // With Up Next laid out (and clipped to the bar), the clip opens a frame later, so it animates.
  useEffect(() => {
    if (layout !== "queue") {
      setExpanded(false);
      setAnimate(false);
      return;
    }
    let frame = requestAnimationFrame(
      () =>
        (frame = requestAnimationFrame(() => {
          setAnimate(true);
          setExpanded(true);
        })),
    );
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  // The progress line runs on between reports (about once a second while playing).
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const duration = state.duration || 0;
      const elapsed =
        (state.position || 0) +
        (state.playing ? (performance.now() - state.at) / 1000 : 0);
      if (bar.current)
        bar.current.style.transform = `scaleX(${duration ? Math.min(1, elapsed / duration) : 0})`;
      if (state.playing) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [state]);

  const queueOpen = layout === "queue";
  const openQueue = () => {
    if (closing.current) return;
    if (fixed) return api.setMiniLayout("queue");
    // Above the bar if there's room on this screen, otherwise below it.
    const next: MiniGrow =
      window.screenY + window.innerHeight - MINI_SIZES.queue.height >=
      (screen as Screen & { availTop: number }).availTop
        ? "up"
        : "down";
    setGrow(next);
    api.setMiniLayout("queue", next);
  };
  const closeQueue = () => {
    if (closing.current || !queueOpen) return;
    setExpanded(false);
    closing.current = setTimeout(() => {
      closing.current = null;
      api.setMiniLayout("bar");
    }, RESIZE_MS);
  };
  const hide = () => api.hideMiniPlayer();

  // Clicking anywhere else folds Up Next back into the bar.
  const onBlur = useRef(() => undefined as void);
  onBlur.current = closeQueue;
  useEffect(() => {
    const listener = () => onBlur.current();
    window.addEventListener("blur", listener);
    return () => window.removeEventListener("blur", listener);
  }, []);

  // The window follows the cursor (in the main process) from press to release.
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || interactive(e.target)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    api.miniMoveStart();
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    api.miniMoveEnd();
  };

  const seek = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || !state.duration) return;
    const seconds =
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) *
      state.duration;
    api.miniSeek(seconds);
    setState((s) => ({ ...s, position: seconds, at: performance.now() }));
  };

  const accent = state.accent || "rgb(250 88 106)";
  const has = !!state.title;
  const open = queueOpen && expanded;
  // The part of the pill to show: all of it with Up Next open, otherwise just the bar's end.
  const hidden = OPEN - BAR;
  const clip = open
    ? "inset(0 round 24px)"
    : !queueOpen
      ? `inset(0 round ${BAR / 2}px)`
      : grow === "up"
        ? `inset(${hidden}px 0 0 0 round ${BAR / 2}px)`
        : `inset(0 0 ${hidden}px 0 round ${BAR / 2}px)`;
  return (
    <div
      className={`flex h-screen w-screen flex-col select-none ${grow === "up" ? "justify-end" : "justify-start"}`}
      style={{ padding: INSET }}
    >
      {/* A small shadow, inside the window's see-through margin so the window's edge never cuts it into a box. */}
      <div
        className="w-full flex-none"
        style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.45))" }}
      >
        <div
          className={`relative flex w-full flex-col overflow-hidden border border-white/12 ${systemDrag ? "app-drag" : ""}`}
          style={{
            height: queueOpen ? OPEN : BAR,
            borderRadius: open ? 24 : BAR / 2,
            clipPath: clip,
            transition: animate
              ? `clip-path ${RESIZE_MS}ms ${EASE}, border-radius ${RESIZE_MS}ms ${EASE}`
              : "none",
            background: `linear-gradient(115deg, color-mix(in srgb, ${accent} 26%, transparent), transparent 62%), rgb(18 18 22 / 0.62)`,
          }}
          onPointerEnter={() => fixed && api.miniInteractive(true)}
          onPointerLeave={() =>
            fixed && !dragging.current && api.miniInteractive(false)
          }
          onPointerDown={systemDrag ? undefined : onPointerDown}
          onPointerUp={systemDrag ? undefined : onPointerUp}
          onPointerCancel={systemDrag ? undefined : onPointerUp}
          onDoubleClick={(e) => !interactive(e.target) && api.openMainWindow()}
        >
          <div
            className="relative flex flex-none items-center gap-3 pr-2.5 pl-[7px]"
            style={{ height: BAR - 2 }}
          >
            <button
              className="size-[52px] flex-none overflow-hidden rounded-[16px] bg-white/8 transition-[scale] duration-200 active:scale-95"
              title="Open Sonara"
              aria-label="Open Sonara"
              onClick={() => api.openMainWindow()}
            >
              {state.thumbnail ? (
                <img
                  key={state.thumbnail}
                  src={state.thumbnail}
                  alt=""
                  draggable={false}
                  className="size-full animate-fade-in object-cover"
                />
              ) : (
                <LogoMark size={30} className="m-auto" />
              )}
            </button>
            <div
              key={state.title ?? ""}
              className="flex min-w-0 flex-1 animate-fade-in flex-col"
            >
              <span className="truncate type-body-emphasized text-primary">
                {state.title ?? "Nothing playing"}
              </span>
              <span className="truncate type-callout text-secondary">
                {has ? state.artist : "Play something in Sonara"}
              </span>
            </div>
            <div className="flex flex-none items-center gap-0.5">
              <button
                className={control}
                disabled={!has}
                aria-label="Previous"
                title="Previous (Ctrl+Alt+←)"
                onClick={() => api.miniCommand("previous")}
              >
                <PreviousGlyph size={18} />
              </button>
              <button
                className="grid size-10 flex-none place-items-center rounded-full text-white transition-[scale,filter] duration-200 hover:brightness-110 active:scale-90 disabled:opacity-35"
                style={{ background: accent }}
                disabled={!has}
                aria-label={state.playing ? "Pause" : "Play"}
                title={`${state.playing ? "Pause" : "Play"} (Ctrl+Alt+Space or Ctrl+Alt+P)`}
                onClick={() => api.miniCommand("play-pause")}
              >
                <span
                  key={String(state.playing)}
                  className="grid animate-glyph place-items-center"
                >
                  {state.playing ? (
                    <PauseGlyph size={20} />
                  ) : (
                    <PlayGlyph size={20} className="translate-x-px" />
                  )}
                </span>
              </button>
              <button
                className={control}
                disabled={!has}
                aria-label="Next"
                title="Next (Ctrl+Alt+→)"
                onClick={() => api.miniCommand("next")}
              >
                <NextGlyph size={18} />
              </button>
              <button
                className={control}
                aria-pressed={open}
                aria-label="Up Next"
                title="Up Next"
                onClick={() => (queueOpen ? closeQueue() : openQueue())}
              >
                <ListMusic size={17} strokeWidth={2} />
              </button>
              <span
                aria-hidden="true"
                className="mx-1 h-6 w-px flex-none bg-white/15"
              />
              <button
                className={`${control} size-8 text-secondary hover:text-primary`}
                aria-label="Hide the mini player"
                title="Hide (Ctrl+Alt+M)"
                onClick={hide}
              >
                <X size={15} strokeWidth={2.2} />
              </button>
            </div>
            {/* The progress line: click (or drag along) it to move through the song. */}
            <div
              data-seek
              className={`group/seek absolute inset-x-4 bottom-0 h-3.5 ${state.duration ? "cursor-pointer" : "pointer-events-none"}`}
              role="slider"
              aria-label="Song position"
              aria-valuemin={0}
              aria-valuemax={Math.round(state.duration || 0)}
              aria-valuenow={Math.round(state.position || 0)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                seek(e.clientX);
              }}
              onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}
            >
              <div
                ref={track}
                className="absolute inset-x-2 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-white/10 transition-[height] duration-200 group-hover/seek:h-1"
              >
                <div
                  ref={bar}
                  className="h-full origin-left"
                  style={{ background: accent, transform: "scaleX(0)" }}
                />
              </div>
            </div>
          </div>
          {queueOpen && (
            <div
              data-list
              className={`flex min-h-0 flex-1 flex-col border-white/10 bg-black/50 ${grow === "up" ? "order-first border-b" : "border-t"}`}
              style={{
                opacity: open ? 1 : 0,
                transition: `opacity ${open ? RESIZE_MS : RESIZE_MS * 0.6}ms ${EASE}`,
              }}
            >
              <h2 className="px-4 pt-3 pb-1.5 type-callout-emphasized text-secondary">
                Up Next{state.upNext?.length ? ` · ${state.upNext.length}` : ""}
              </h2>
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {state.upNext?.length ? (
                  state.upNext.map((song, i) => (
                    <button
                      key={song.index}
                      className="flex h-12 w-full animate-rise items-center gap-3 rounded-[10px] px-2 text-left transition-[background-color,scale] duration-200 hover:bg-white/10 active:scale-[0.98]"
                      style={{
                        animationDelay: `${120 + Math.min(i, 8) * 35}ms`,
                      }}
                      title={`Play “${song.title}”`}
                      onClick={() => api.miniJumpTo(song.index)}
                    >
                      <span className="size-9 flex-none overflow-hidden rounded-[7px] bg-white/8">
                        {song.thumbnail && (
                          <img
                            src={song.thumbnail}
                            alt=""
                            draggable={false}
                            className="size-full object-cover"
                          />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate type-body-emphasized text-primary">
                          {song.title}
                        </span>
                        <span className="truncate type-callout text-secondary">
                          {song.artist}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-6 text-center type-callout text-tertiary">
                    Nothing is queued after this song.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
