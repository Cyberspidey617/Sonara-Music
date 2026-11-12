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
    version: '2.3.3',
    notes: [
      {
        icon: Clapperboard,
        title: 'Music videos from YouTube Music itself',
        body: 'Sign in to YouTube Music (Settings › Your Music) and a song’s video is the one YouTube Music pairs with it, lined up with the song even when the video has an intro. Signed in, age-restricted songs play too.',
      },
      {
        icon: Clapperboard,
        title: 'Lyric videos, and more videos found',
        body: 'When a song has no official video, its lyric video plays, only from the artist’s own channel or a trusted label. Japanese titles find their videos in either script, and covers that are just a picture held still are skipped.',
      },
      {
        icon: Clapperboard,
        title: 'Video mode stays on',
        body: 'Close the full-screen player during a video and open it again: the video is still on, and the next song shows its video too. On Low quality or the system’s data saver, Auto plays videos at 480p.',
      },
      {
        icon: Sparkles,
        title: 'Seek bar knob fixed',
        body: 'The knob no longer jumps to the start when the seek bar changes style or opens from the pebble, in the player or the Settings preview.',
      },
    ],
  },
  {
    version: '2.3.2',
    notes: [
      {
        icon: Sparkles,
        title: 'Eco mode',
        body: 'Sonara looks and moves as designed again. When you want it lighter on your PC, Eco mode (Settings › Playback) uses simpler glass and fewer frames. On Auto it turns itself on while your PC runs on battery.',
      },
      {
        icon: Clapperboard,
        title: 'The right music video, or none',
        body: 'Videos are now matched strictly to the song: the same title and version, credited to the same artist, and close to the same length. Covers, remixes, lyric videos and fan uploads no longer stand in, and more official videos are found.',
      },
      {
        icon: Clapperboard,
        title: 'Video quality up to 4K',
        body: 'The quality menu lists every quality the video offers, up to 4K, plus Auto (Full HD). If a quality won’t play on your PC, Sonara steps down to Full HD by itself.',
      },
      {
        icon: Sparkles,
        title: 'Seek bar fixes',
        body: 'The seek bar preview in Settings and the mini player’s wave seek bar move again, and the Knob setting now works for every style.',
      },
    ],
  },
  {
    version: '2.3.1',
    notes: [
      {
        icon: Sparkles,
        title: 'Lighter on your PC',
        body: 'Sonara now uses far less of your PC: about half while a song plays and a third in video mode. Animations you can’t see stop, and the waveform rests after you pause. Power saver (Settings › Playback) uses simpler glass and fewer frames, by itself while on battery.',
      },
      {
        icon: Clapperboard,
        title: 'Smoother music videos',
        body: 'Video mode no longer stutters: the app behind the video rests while you watch.',
      },
      {
        icon: Sparkles,
        title: 'Click a song, it plays',
        body: 'Clicking a song plays it straight away, even during a radio. To let the current song finish first, use Start Radio from the song’s menu.',
      },
    ],
  },
  {
    version: '2.3.0',
    notes: [
      {
        icon: Sparkles,
        title: 'Lossless sources, up to 24-bit',
        body: 'Settings › Your Music › Lossless sources: add a source by its address (any server speaking the open addon protocol). With quality set to Lossless, songs you don’t have play from it in FLAC, with the badge showing the bit depth and sample rate.',
      },
      {
        icon: Sparkles,
        title: 'Recommendations that learn more',
        body: 'Made for you now notices songs you skip early and stops suggesting ones you keep skipping. It counts your likes and this week’s plays, mixes up New for you on each refresh, and adds Discover (artists new to you) and New from your artists.',
      },
      {
        icon: Sparkles,
        title: 'Incognito',
        body: 'Turn on Incognito in the sidebar to play without leaving a trace: no Recently played, no Wrapped listens, no scrobbles, and nothing changes your recommendations.',
      },
      {
        icon: Sparkles,
        title: 'Radio keeps your song playing',
        body: 'Starting a radio no longer stops what’s playing: the radio comes after it. Two new seek bars too (Settings › Player): Expressive, a Material 3 wave, and Capsule, a thick bar with no knob. Wrapped now shows your top artists’ own photos.',
      },
      {
        icon: Sparkles,
        title: 'Scrobbling, speed, and more',
        body: 'Scrobble to ListenBrainz or Last.fm (Settings › Playback). Change the playback speed from 0.5× to 2× with the pitch kept. Song menus have About This Song (from Wikipedia) and Copy song.link, and you can hide music videos from Home and search.',
      },
    ],
  },
  {
    version: '2.2.9',
    notes: [
      {
        icon: Sparkles,
        title: 'A Home that puts your music first',
        body: 'Your songs and playlists at the top, then Quick picks, Recently played, what’s trending and Made for you. Playlists to explore are at the bottom.',
      },
      {
        icon: Clapperboard,
        title: 'More music videos found',
        body: 'Official videos from labels Sonara didn’t know by name now show up too, such as Kalyani’s.',
      },
    ],
  },
  {
    version: '2.2.8',
    notes: [
      {
        icon: Clapperboard,
        title: 'Music videos play to the end',
        body: 'When the official video is a different length from the song, the video is now the song: the seek bar shows its time, and the next song starts when the video ends, not before.',
      },
      {
        icon: Download,
        title: 'Backups of everything that’s yours',
        body: 'Settings › About › Your data: back up your liked songs, playlists, history, settings and listening to one file, and restore it here or on another PC. Sonara also backs itself up once a week.',
      },
      {
        icon: Sparkles,
        title: 'Genres & Moods, and search tabs',
        body: 'Browse YouTube Music’s moods and genres from the sidebar. Search results now have tabs for Songs, Videos, Albums, Artists and Playlists.',
      },
      {
        icon: MicVocal,
        title: 'Sync lyrics yourself',
        body: 'Lyrics that aren’t timed? Press “Sync it yourself”, play the song and tap as each line starts. They’ll play along from then on.',
      },
      {
        icon: WifiOff,
        title: 'Proxy, and help when something’s wrong',
        body: 'Settings › About: use a proxy on networks that block YouTube, report a problem with Sonara’s log ready to paste, clear the cache, or reset settings.',
      },
      {
        icon: Sparkles,
        title: 'Steadier and safer',
        body: 'If Sonara’s window ever crashes or freezes, it comes back by itself with your song where it was. Sonara’s files are now locked against tampering, songs you point at start faster, and covers of your library are kept for offline.',
      },
    ],
  },
  {
    version: '2.2.7',
    notes: [
      {
        icon: Sparkles,
        title: 'Made for you, by what you play',
        body: 'Home now learns from your listening: New for you (songs like your favourites you haven’t heard), On repeat, your most played artists, and a daylist for the time of day. Your first picks still count.',
      },
      {
        icon: Sparkles,
        title: 'Not interested, and your taste profile',
        body: 'Say “Not interested” to a song or an artist from its menu, or keep a song out of your taste. Add notes like “90s Tamil melodies” in Settings › Playback, and each becomes a shelf on Home.',
      },
      {
        icon: Sparkles,
        title: 'Smart Shuffle and playlist recommendations',
        body: 'Press shuffle again for Smart Shuffle: songs like yours mixed into the queue, each marked with a sparkle. Your playlists now end with songs that fit them, one click to add.',
      },
    ],
  },
  {
    version: '2.2.6',
    notes: [
      {
        icon: Clapperboard,
        title: 'Smoother music videos',
        body: 'No more stutter after skipping ahead: the picture waits for the new spot to load and starts again in time. Videos that are a different length from the song now play with their own sound (the song goes on silently), at the same volume.',
      },
      {
        icon: Sparkles,
        title: 'Your seek bar, your way',
        body: 'Settings › Player › Seek bar: Rounded, Line or a moving Wave, in white, your accent or any colour, as thick as you like, with the knob and times shown as you choose. Every seek bar follows it, the mini player’s too.',
      },
      {
        icon: Clapperboard,
        title: 'Video controls',
        body: 'A seek bar with play and skip under the video, a size menu (original ratio, fill, 75%, 50%) that keeps each video’s own shape, and controls that fade away while you watch, coming back when you move the mouse.',
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
      // Seen as soon as it's shown: once per update, even if Sonara is closed with it open.
      updateSettings({ lastSeenVersion: current });
      if (notes.length) setShown({ current, notes });
    });
  }, []);
  if (!shown) return null;
  const close = () => setShown(null);
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
