import { Check, X } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { markStep, STEPS, type StepId } from '@/lib/checklist';
import { useLibrary } from '@/state/library';
import { usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';

/** What each step's button does (and ticks it, where the button itself is the step). */
const ACTIONS: Record<StepId, () => void> = {
  play: () => useUi.getState().focusSearch(),
  queue: () => useUi.getState().setSidePanel('queue'),
  mini: () => {
    markStep('mini');
    api.toggleMiniPlayer();
  },
  video: () => (usePlayer.getState().queue.length ? useUi.getState().setFullScreen(true) : toast('Play a song first, then open the full-screen player')),
  shortcuts: () => useUi.getState().openDialog({ kind: 'shortcuts' }),
};

/** Someone who has used Sonara a while: the card isn't for them. */
function experienced(): boolean {
  const { history, liked, playlists } = useLibrary.getState();
  return history.length >= 15 || liked.length >= 5 || playlists.length > 0;
}

/** Home's "Getting started" card, for new users: five things to try, ticked off as you do them. */
export function GettingStarted() {
  const done = useLibrary((s) => s.settings.checklist ?? {});
  const hidden = useLibrary((s) => s.settings.checklistHidden);
  const started = Object.keys(done).length > 0;
  // Put away for good for anyone who was using Sonara before it existed (nothing ticked yet).
  const forOthers = !hidden && !started && experienced();
  useEffect(() => {
    if (forOthers) useLibrary.getState().updateSettings({ checklistHidden: true });
  }, [forOthers]);
  // Ctrl + Alt + M from anywhere counts too.
  useEffect(() => api.onMiniOpened(() => markStep('mini')), []);
  if (hidden || forOthers) return null;
  const count = STEPS.filter((s) => done[s.id]).length;
  const all = count === STEPS.length;
  const hide = () => useLibrary.getState().updateSettings({ checklistHidden: true });
  return (
    <section className="mx-(--body-gutter) mb-8 rounded-[22px] bg-white/[0.055] p-5 ring-1 ring-white/8 ring-inset">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="type-title-2-emphasized text-primary">{all ? 'You’re all set!' : 'Getting started'}</h2>
          <p className="type-callout text-secondary">{all ? 'Now sit back and hit play.' : `Hints for the best of Sonara · ${count}/${STEPS.length}`}</p>
        </div>
        <button className="grid size-8 place-items-center rounded-full text-secondary hover:bg-white/10 hover:text-primary" aria-label="Hide Getting started" title="Hide (Settings › About brings it back)" onClick={hide}>
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-key transition-[width] duration-500" style={{ width: `${(count / STEPS.length) * 100}%` }} />
      </div>
      {!all && (
        <ol className="mt-4 grid gap-2 @min-[760px]/page:grid-cols-2 @min-[1100px]/page:grid-cols-3">
          {STEPS.map((step, i) => {
            const ticked = !!done[step.id];
            return (
              <li key={step.id} className={`flex gap-3 rounded-[14px] p-3 ${ticked ? 'opacity-55' : 'bg-white/[0.04]'}`}>
                <span className={`grid size-6 flex-none place-items-center rounded-full type-footnote font-bold ${ticked ? 'bg-key text-(--onKeyColor)' : 'bg-white/10 text-secondary'}`}>
                  {ticked ? <Check size={13} strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block type-body-emphasized text-primary">{step.title}</span>
                  <span className="mt-0.5 block type-callout text-secondary">{step.body}</span>
                  {!ticked && (
                    <button className="mt-1.5 type-callout-emphasized text-key hover:underline" onClick={ACTIONS[step.id]}>
                      {step.action}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
