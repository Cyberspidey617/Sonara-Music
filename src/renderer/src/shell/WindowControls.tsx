import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, isElectron } from '@/lib/api';

const button = 'grid size-7 place-items-center rounded-full text-secondary transition-colors hover:bg-white/10 hover:text-primary';

/**
 * Minimise, maximise/restore and close, drawn in the app's own glass so they follow the
 * theme (the system's caption buttons are hidden). Above every view, as those were.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    void api.isWindowMaximized().then(setMaximized, () => undefined);
    return api.onMaximizedChange(setMaximized);
  }, []);
  // macOS has its own traffic lights.
  if (!isElectron || document.documentElement.dataset.platform === 'mac') return null;
  return (
    <div data-elastic="0.6" className="glass elastic app-no-drag fixed top-[5px] right-2 z-[9800] flex h-[34px] items-center gap-0.5 rounded-pill px-[3px]">
      <button className={button} aria-label="Minimise" title="Minimise" onClick={() => api.minimizeWindow()}>
        <Minus size={15} strokeWidth={2} />
      </button>
      <button className={button} aria-label={maximized ? 'Restore' : 'Maximise'} title={maximized ? 'Restore' : 'Maximise'} onClick={() => api.toggleMaximizeWindow()}>
        {maximized ? <Copy size={12} strokeWidth={2} className="-scale-x-100" /> : <Square size={12} strokeWidth={2} />}
      </button>
      <button className={`${button} hover:bg-[#e81123] hover:text-white`} aria-label="Close" title="Close" onClick={() => api.closeWindow()}>
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
