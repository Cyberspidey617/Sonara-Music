import { Clapperboard, Download, Keyboard, MicVocal, Sparkles, WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/Dialogs';
import { api } from '@/lib/api';
import { useLibrary } from '@/state/library';
import { go } from '@/state/nav';

type Note = { icon: LucideIcon; title: string; body: string; open?: () => void; action?: string };

/** What each version brought, newest first. Shown once, after Sonara updates to it. */
const NOTES: { version: string; notes: Note[] }[] = [
  {
    version: '2.2.6',
    notes: [
      {
        icon: Clapperboard,
        title: 'Smoother music videos',
        body: 'No more stutter after skipping ahead: the picture waits for the new spot to load and starts again in time. Videos that are a different length from the song now play with their own sound (the song goes on silently), at the same volume.',
      },
      {
        icon: Clapperboard,
        title: 'Video controls',
        body: 'A seek bar with play and skip under the video, a size menu (fit, fill, 75%, 50%) that keeps each video’s own shape, and controls that fade away while you watch, coming back when you move the mouse.',
      },
    ],
  },
  {
    version: '2.2.5',
    notes: [
      {
        icon: Clapperboard,
        title: 'Better music videos',
        body: 'Only official videos from the artist or their label now, never reuploads or audio on a still picture. Pick the video quality (1080p to 360p) next to the video button. When the only official video is a different length from the song, Sonara still shows it, and tells you it may not be in sync.',
      },
    ],
  },
  {
    version: '2.2.4',
    notes: [
      {
        icon: Sparkles,
        title: 'Wrapped, every month',
        body: 'Your minutes, top songs and artists, your sound (genres) and when you listen. A song counts after 30 seconds. Find it in the sidebar.',
        action: 'Open Wrapped',
        open: () => go({ name: 'wrapped' }),
      },
      {
        icon: MicVocal,
        title: 'Resync lyrics',
        body: 'Lyrics early or late? Press Resync over the lyrics to move the whole song, or a single line, by 0.1 s. Press Now as a line starts to set it. Kept for each song.',
      },
      {
        icon: Clapperboard,
        title: 'Music videos in full screen',
        body: 'When a song has a music video on YouTube, the video button in the full-screen player shows it, in time with the song.',
      },
      {
        icon: WifiOff,
        title: 'A proper offline mode',
        body: 'With no internet, Home shows your downloads with their covers: click one to play. The accent colour still follows the song, and songs that need the internet say “Check your internet connection”.',
      },
      { icon: Download, title: 'Faster downloads', body: 'Songs download in several parts at once, so they finish much faster on slower connections.' },
      {
        icon: Keyboard,
        title: 'Shortcuts on Linux',
        body: 'System-wide shortcuts work on Wayland desktops, Ctrl + Alt + N / B also skip songs, and Settings says which shortcuts your system keeps for itself.',
      },
    ],
  },
];

/** -1, 0 or 1, comparing two versions like 2.2.4. */
function compare(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** After an update, once: what changed since the version you had. */
export function WhatsNew() {
  const [shown, setShown] = useState<{ current: string; notes: typeof NOTES } | null>(null);
  useEffect(() => {
    void api.updateState().then(({ current }) => {
      const { settings, history, liked, updateSettings } = useLibrary.getState();
      const seen = settings.lastSeenVersion;
      // Not noted before: a new install (nothing to tell), or an update from before these notes.
      const before = seen || (history.length || liked.length || settings.tasteSeen ? '2.2.3' : current);
      if (compare(current, before) <= 0) {
        if (seen !== current) updateSettings({ lastSeenVersion: current });
        return;
      }
      const notes = NOTES.filter((n) => compare(n.version, before) > 0 && compare(n.version, current) <= 0);
      if (notes.length) setShown({ current, notes });
      else updateSettings({ lastSeenVersion: current });
    });
  }, []);
  if (!shown) return null;
  const close = () => {
    useLibrary.getState().updateSettings({ lastSeenVersion: shown.current });
    setShown(null);
  };
  return (
    <Modal title={`What’s new in Sonara ${shown.current}`} onClose={close} width={500}>
      <div className="no-scrollbar max-h-[min(62vh,560px)] overflow-y-auto px-7">
        <p className="type-body-reduced text-secondary">Sonara updated. Here’s what changed:</p>
        {shown.notes.map(({ version, notes }) => (
          <section key={version} className="mt-4">
            {shown.notes.length > 1 && <div className="mb-2 type-footnote font-bold tracking-[0.12em] text-tertiary uppercase">Version {version}</div>}
            <ul className="space-y-3">
              {notes.map(({ icon: Icon, title, body, open, action }) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-9 flex-none place-items-center rounded-[10px] bg-key/18 text-key">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block type-body-emphasized text-primary">{title}</span>
                    <span className="mt-0.5 block type-callout text-secondary">{body}</span>
                    {open && (
                      <button
                        className="mt-1 type-callout-emphasized text-key hover:underline"
                        onClick={() => {
                          close();
                          open();
                        }}
                      >
                        {action}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex justify-end px-7 pt-4 pb-6">
        <button className="inline-flex h-9 items-center rounded-pill bg-pill-bg px-6 type-body-emphasized text-pill hover:bg-white" autoFocus onClick={close}>
          Got it
        </button>
      </div>
    </Modal>
  );
}
