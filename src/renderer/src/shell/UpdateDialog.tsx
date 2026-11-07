import { CheckCircle2, Download, Loader2, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UpdateState } from '@shared/types';
import { Modal } from '@/components/Dialogs';
import { api } from '@/lib/api';

const primary = 'inline-flex h-9 items-center gap-2 rounded-pill bg-pill-bg px-5 type-body-emphasized text-pill hover:bg-white disabled:opacity-40';
const secondary = 'h-9 rounded-pill bg-white/10 px-5 type-body-emphasized hover:bg-white/15';

/**
 * The update window: one window from "a new version is out" to "restart now". It asks first, then
 * shows the download's progress, then offers the restart, all in place. It opens when a new version
 * is found (once per version, unless you start it from Settings), and stays through the download.
 */
export function UpdateDialog() {
  const [u, setU] = useState<UpdateState | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(
    () =>
      api.onUpdateState((s) => {
        setU(s);
        // A new version opens the window (unless you said Later to this one); a download or a
        // finished one always does, wherever it was started.
        if ((s.phase === 'available' && dismissed !== s.latest) || s.phase === 'downloading' || s.phase === 'ready') setOpen(true);
      }),
    [dismissed],
  );

  if (!open || !u || !['available', 'downloading', 'ready', 'error'].includes(u.phase)) return null;
  const later = () => {
    setOpen(false);
    if (u.latest) setDismissed(u.latest);
  };
  const percent = u.percent ?? 0;

  return (
    <Modal title={u.phase === 'ready' ? 'Ready to update' : u.phase === 'error' ? 'Update didn’t finish' : 'A new version of Sonara'} onClose={u.phase === 'downloading' ? () => setOpen(false) : later} width={440}>
      <div className="relative px-7 pb-6">
        {u.phase === 'available' && (
          <>
            <p className="type-body-reduced text-secondary">
              Sonara <b className="text-primary">{u.latest}</b> is available. You have {u.current}.
              {u.canInstall ? ' It downloads here and installs when Sonara restarts.' : ' This copy can’t update itself (macOS, or the portable or .deb version), so the download page opens.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className={secondary} onClick={later}>
                Later
              </button>
              <button className={primary} autoFocus onClick={() => (u.canInstall ? void api.downloadUpdate() : (window.open(u.url), later()))}>
                <Download size={15} /> {u.canInstall ? 'Update' : 'Open the download page'}
              </button>
            </div>
          </>
        )}
        {u.phase === 'downloading' && (
          <>
            <p className="flex items-center gap-2 type-body-reduced text-secondary">
              <Loader2 size={15} className="animate-spin" /> Downloading Sonara {u.latest}…
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Download progress">
              <div className="h-full rounded-full bg-key transition-[width] duration-300" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-right type-callout text-tertiary tabular-nums">{percent}%</p>
            <p className="mt-3 type-callout text-tertiary">You can keep listening, or minimise Sonara: it comes back to the front when the download is done.</p>
          </>
        )}
        {u.phase === 'ready' && (
          <>
            <p className="flex items-start gap-2 type-body-reduced text-secondary">
              <CheckCircle2 size={18} className="mt-px flex-none text-key" />
              <span>
                Sonara <b className="text-primary">{u.latest}</b> is downloaded and checked. Restart to install it; Sonara opens again by itself.
              </span>
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className={secondary} onClick={later}>
                Later
              </button>
              <button className={primary} autoFocus onClick={() => api.installUpdate()}>
                <RotateCcw size={15} /> Restart now
              </button>
            </div>
            <p className="mt-3 type-callout text-tertiary">Later: it installs the next time you quit Sonara.</p>
          </>
        )}
        {u.phase === 'error' && (
          <>
            <p className="type-body-reduced text-secondary">{u.error ?? 'Something went wrong.'}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className={secondary} onClick={() => setOpen(false)}>
                Close
              </button>
              <button className={primary} onClick={() => void api.checkForUpdate()}>
                <RotateCcw size={15} /> Try again
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
