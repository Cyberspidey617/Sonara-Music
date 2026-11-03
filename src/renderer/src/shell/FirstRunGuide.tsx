import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { MousePointerClick, Sparkles } from 'lucide-react';
import { LogoMark } from '@/components/icons';
import { useLibrary } from '@/state/library';
import { toast } from '@/state/ui';

interface Step {
  title: string;
  body: ReactNode;
  /** What to light up, if anything: the rest of the window dims around it. */
  target?: string;
  icon?: ReactNode;
}

const kbd = 'rounded-[6px] bg-white/12 px-1.5 py-0.5 type-callout-emphasized text-primary';

const STEPS: Step[] = [
  {
    title: 'Welcome to Sonara',
    body: 'Your music, in liquid glass. This quick tour shows you around in under a minute.',
    icon: <LogoMark size={34} className="text-key" />,
  },
  {
    title: 'The sidebar',
    body: 'Point at it to open Home, Search, your library and playlists. It folds back to icons when you move away.',
    target: 'nav[aria-label="Main"]',
  },
  {
    title: 'Search',
    body: (
      <>
        Find songs, albums, artists and playlists. Press <kbd className={kbd}>Ctrl + K</kbd> from anywhere.
      </>
    ),
    target: 'input[placeholder^="Search songs"]',
  },
  {
    title: 'The player',
    body: 'While music plays, it rests as a pebble with a live waveform. Point at it for every control; click the cover for the full-screen player.',
    target: '[aria-label="Player"]',
  },
  {
    title: 'Right-click anything',
    body: 'Songs, albums and playlists have more on right-click: Play Next, Add to Playlist, Download, Go to Artist, and removing songs from Recently Played.',
    icon: <MousePointerClick size={30} className="text-key" />,
  },
  {
    title: 'Make it yours',
    body: 'Themes, accent, fonts, glass, the waveform and more are in Settings. Changes show in a live preview until you press Apply.',
    target: 'nav button[title="Settings"]',
  },
  {
    title: 'Handy shortcuts',
    body: (
      <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <kbd className={kbd}>Space</kbd> <span>Play / pause</span>
        <kbd className={kbd}>Ctrl + → / ←</kbd> <span>Next / previous song</span>
        <kbd className={kbd}>L</kbd> <span>Lyrics</span>
        <kbd className={kbd}>F</kbd> <span>Full-screen player</span>
        <span className="col-span-2 mt-1 text-tertiary">All of them are in Settings › About.</span>
      </span>
    ),
    icon: <Sparkles size={28} className="text-key" />,
  },
];

/** Where the lit-up element is, kept current as the window changes size. */
function useTargetRect(selector: string | undefined) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) return setRect(null);
    const measure = () => setRect(document.querySelector(selector)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);
    const timer = setInterval(measure, 400); // follows the sidebar and player as they animate
    return () => {
      window.removeEventListener('resize', measure);
      clearInterval(timer);
    };
  }, [selector]);
  return rect;
}

/**
 * The first-run guide: a few steps over the real app, the part each one is about lit up.
 * Skipping (or finishing) remembers it; Settings › About can show it again.
 */
export function FirstRunGuide() {
  const seen = useLibrary((s) => s.settings.guideSeen);
  const [index, setIndex] = useState(0);
  const step = STEPS[index]!;
  const rect = useTargetRect(seen ? undefined : step.target);
  const last = index === STEPS.length - 1;

  const done = (skipped: boolean) => {
    useLibrary.getState().updateSettings({ guideSeen: true });
    setIndex(0);
    if (skipped) toast('Guide skipped. Keyboard shortcuts are in Settings › About.');
  };

  useEffect(() => {
    if (seen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(true);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') (last ? done(false) : setIndex((i) => i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, last]);

  if (seen) return null;
  const pad = 8;
  // The card sits beside what's lit up (right of the sidebar, above the player), or in the middle.
  const card: React.CSSProperties = !rect
    ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
    : rect.left < 120
      ? { left: rect.right + 24, top: Math.min(Math.max(16, rect.top + 40), window.innerHeight - 260) }
      : rect.top > window.innerHeight / 2
        ? { left: Math.min(Math.max(16, rect.left + rect.width / 2 - 190), window.innerWidth - 396), top: rect.top - 236 }
        : { left: Math.min(Math.max(16, rect.left + rect.width / 2 - 190), window.innerWidth - 396), top: rect.bottom + 20 };

  return (
    <div className="fixed inset-0 z-[9700]" role="dialog" aria-modal="true" aria-label="Welcome guide">
      {/* The dimmed window, with a lit cut-out around the step's subject. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-[22px] ring-2 ring-key/80 transition-all duration-500 ease-(--ease-out-panel)"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.62)' }}
        />
      ) : (
        <div className="absolute inset-0 animate-fade bg-black/62" />
      )}
      <div key={index} className="glass-thick absolute w-[380px] animate-menu-in rounded-[22px] p-6" style={{ ...card, backgroundColor: 'var(--dialog-fill)' }}>
        {step.icon && <div className="mb-3">{step.icon}</div>}
        <h2 className="type-[700_20px/26px] tracking-apple text-primary">{step.title}</h2>
        <div className="mt-2 type-body-reduced text-secondary">{step.body}</div>
        <div className="mt-6 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-4 bg-key' : 'w-1.5 bg-white/25'}`} />
            ))}
          </div>
          {!last && (
            <button className="h-8 rounded-pill px-3 type-body-emphasized text-secondary hover:text-primary" onClick={() => done(true)}>
              Skip
            </button>
          )}
          {index > 0 && (
            <button className="h-8 rounded-pill bg-white/10 px-4 type-body-emphasized hover:bg-white/15" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button autoFocus className="h-8 rounded-pill bg-key px-4 type-body-emphasized text-(--onKeyColor) hover:brightness-110" onClick={() => (last ? done(false) : setIndex(index + 1))}>
            {last ? 'Get started' : index === 0 ? 'Show me' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
