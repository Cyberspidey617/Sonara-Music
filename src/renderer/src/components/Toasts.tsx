import { useUi } from '@/state/ui';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  const fullScreen = useUi((s) => s.fullScreen);
  return (
    <div className={`pointer-events-none fixed inset-x-0 z-[9500] flex flex-col items-center gap-2 ${fullScreen ? 'bottom-8' : 'bottom-[calc(var(--player-pill-height)+var(--player-bottom-offset)+14px)] pl-(--content-left)'}`} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="glass-thick pointer-events-auto relative flex max-w-[520px] animate-toast items-center gap-4 rounded-pill py-2.5 pr-3 pl-5">
          <span className="min-w-0 truncate type-body-reduced">{t.message}</span>
          {t.action && (
            <button
              className="relative flex-none rounded-pill bg-white/12 px-3 py-1 type-body-emphasized text-primary hover:bg-white/20"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
