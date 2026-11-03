# Obsidian Music for PC

A desktop (Windows) version of [Obsidian Music](https://github.com/Varun7009/Obsidian-Music), the Android YouTube Music player, rebuilt with the look of [BitChord](https://github.com/kushagrasinghx/BitChord).

The Obsidian Music repository publishes no source code (only screenshots and an APK), so this is a from-scratch rebuild of its features, not a port of its code.

## Features

| From Obsidian Music | On PC |
|---|---|
| Immersive full-screen player | Full-window player: the artwork over a moving mesh of its colours, plus a window full-screen toggle (F11) |
| Real-time, word-by-word synced lyrics | [am-lyrics](https://github.com/uimaxbai/am-lyrics) fetches from lrc.red, BiniLyrics, LRCLIB and others. If none of them has the song, YouTube Music's own lyrics are shown (not synced) |
| Native media notification | Windows media overlay, keyboard media keys, and Previous / Play / Next buttons on the taskbar thumbnail |
| Liked songs and playlists | Saved locally. Create, rename and delete playlists, add songs to them, undo a removal |
| Sleep timer | 5 min to 2 hours, or stop at the end of the current song. Fades out gently |
| Background playback | Keeps playing when minimised. Optionally closes to the system tray |
| YouTube playlist import | Paste any YouTube or YouTube Music playlist link. Large playlists (500+ songs) are read in full |

### New in 1.5.1

- **Lyric pronunciation and translation, rebuilt.** A glass toolbar over the lyrics: *Pronunciation* shows how to sing each line in Latin letters, and *Translate* (to English, Hindi, Malayalam, Tamil, Telugu, Kannada and more). Pronunciation for Indian scripts (Malayalam, Tamil, Hindi, Telugu, Kannada, Bengali, Punjabi, Gujarati, Odia) is done on your PC, offline, written the way people type these languages ("kiliye kiliye", "kehta hai", "paarththen"); other scripts use Google's romanization. Translation tells Google the language from the script instead of guessing, re-checks that each translated line lands on its own lyric (they used to shift), and translates repeated chorus lines once. Both work on synced and unsynced lyrics.
- Settings and Your Music tabs slide between sections instead of reloading the page; the content rises in.
- The search field's bottom edge no longer shows the browser's default inset border; glass edges are lit from above like real glass.

### New in 1.5: downloads, compact sidebar, top search, any window size

- **Downloads.** Download… in any song's menu, or the download button on albums and playlists. Pick a quality each time or save a default:
  - *Best*: YouTube's top stream, Opus ~160 kbps (.webm), saved untouched
  - *Compatible*: AAC 128 kbps (.m4a), which opens in every player, car and phone
  - *Data Saver*: Opus ~64 kbps
  - *Lossless*: the original FLAC/WAV from your folders or server. YouTube has no lossless audio, so a song without a lossless copy says so instead of faking one. Re-encoding YouTube audio to FLAC or 320 kbps MP3 would only add size, so it isn't offered.
  
  Files go to Music\Obsidian Music (changeable) as "Artist - Title". Downloaded songs play from the file, so they work offline. The Downloads page shows progress, retries, and lets you open or remove files. Removing deletes only files in the downloads folder, never your own music.
- **Search in the toolbar**, centred at the top, with suggestions.
- **Compact sidebar.** An icon rail that opens as a pane of glass over the page when you point at it, and closes when you pick something. Settings › Layout › Sidebar can keep it always open.
- **Any window size or shape.** The player bar drops secondary buttons as it narrows; search results, album headers and the home grid reflow; narrow or portrait windows get a one-column full-screen player where the lyrics take the artwork's place; ultrawide windows centre it.
- **More motion and glass.** Menus and dialogs refract what's behind them; menu items cascade in; sections rise into view as you scroll; the player's song info slides in on each change; buttons give under a press; the full-screen seek bar's thumb turns into a glass lens while you drag it.
- Play buttons' triangles are optically centred.

### New in 1.4: Liquid Glass motion

Learned from the [awesome-liquid-glass](https://github.com/carolhsiaoo/awesome-liquid-glass) list (Apple's WWDC25 sessions and the web recreations, mainly [liquid-glass-react](https://github.com/rdev/liquid-glass-react)):

- **Things travel instead of popping.** The artwork grows out of the mini player into the full-screen player and shrinks back into it. The sidebar's selection slides to the item you pick. Pages crossfade (view transitions).
- **Elastic glass.** Floating glass (buttons, the back/forward capsule, the player capsule) leans toward a nearby pointer, stretches in that direction, squishes when pressed and springs back with a little overshoot.
- **Prism edge.** The player capsule's refraction splits colour channels slightly at its rim (chromatic aberration), as real glass does.
- **Content settles in.** Song rows and shelf tiles rise into place one after another when a page opens; headers rise with them.
- **Small moments.** The heart pops when you like a song. Play and pause morph into each other. Tiles lift under the pointer.
- All of it stops when Windows' *Animation effects* is off.

### New in 1.3: equalizer

- **Presets.** The 8 most used up front (Flat, Bass Booster, Vocal Booster, Treble Booster, Pop, Rock, Hip-Hop, Electronic), 15 more a click away (Loudness, Acoustic, Classical, Jazz, Dance, R&B, Deep, Latin, Lounge, Piano, Late Night, Small Speakers, Spoken Word, Bass/Treble Reducer), plus your own saved presets.
- **Basic:** three sliders, Bass, Vocals and Treble, each moving its part of the spectrum.
- **Advanced:** a 10-band graphic EQ (32 Hz – 16 kHz, one octave per band), a preamp, *Prevent clipping*, Save as Preset and Reset. Double-click a slider to zero it; arrow keys move 0.5 dB, Page Up/Down 3 dB.
- The curve on screen is the filters' real frequency response.
- Open it from the player (sliders icon), the full-screen player, or Settings › Equalizer.

**Audio quality.** Until you first turn the equalizer on, playback is exactly as before: nothing new is in the audio path. On, the audio runs through Web Audio at your output device's own sample rate in 32-bit float. With the equalizer off, or every band at 0 dB, the filters are bypassed. *Prevent clipping* (on by default) lowers the level by the largest boost, so boosts never distort. `scripts/e2e-eq.cjs` checks all of this on a 24-bit FLAC of test tones: the file reaches the player bit for bit, and each preset's measured change matches its filters (for example, Treble Booster +3.3 dB measured against +3.3 dB predicted).

### New in 1.2: Apple's design language

The interface follows Apple's current design language, **Liquid Glass** (macOS Tahoe 26 / iOS 26), and the Human Interface Guidelines:

- **Glass only on the navigation layer.** The sidebar floats as an inset pane of glass, and pages extend beneath it (album colours, artist photos, shelves). The player is a floating capsule with real refraction: an SVG displacement map bends whatever is behind its rim. Glass is never stacked on glass.
- **The four variants.** Regular (back/forward, buttons), thick (sidebar, menus, dialogs, the lyrics/queue inspector, which runs edge to edge), clear (controls over the full-screen player's artwork) and prominent (the one primary action, tinted with the accent). Each has a lit specular rim, and lights up under the pointer.
- **Scroll edge effect.** Content blurs and fades as it scrolls under the floating controls, with no hard bars.
- **Controls.** Capsule segmented controls with a sliding lens of glass, switches whose knob stretches as you press it, related buttons grouped into one capsule, and menus with icons that spring open from where you clicked.
- **Type.** Inter, with optical sizing and Apple's tight tracking (SF Pro can't be bundled outside Apple platforms). Headers are bold, left-aligned and title case, never all capitals.
- **Concentric shapes.** Corner radii nest inside each other; large controls are capsules.
- **Settings › Appearance › Liquid Glass: Clear or Tinted**, like the choice Apple added in 26.1. Tinted is frostier and easier to read.
- **Accessibility.** With Windows' *Transparency effects* off, glass turns solid. *Contrast themes* give black glass with a bright border. *Animation effects* off stops the motion.
- **A layered app icon**: the obsidian shard as a pane of frosted glass over a warm gradient.
- Accent presets now start with Apple Music red and Apple's system blue.

### New in 1.1: lossless audio and customisation

**Lossless.** YouTube's best stream is lossy (Opus, about 160 kbps). Lossless comes from your own music, with no third-party streaming services involved:

- **Folders on this PC.** Add folders of FLAC, WAV, MP3, M4A or Ogg. They're scanned for tags and artwork and appear under **Your Music**, with a LOSSLESS or HI-RES badge.
- **Your own server.** Navidrome, Gonic, Airsonic or any other Subsonic-compatible server. Songs stream in their original format (`format=raw`). The password isn't stored: only a salted token, encrypted with Windows DPAPI.
- **"Lossless when available".** With this audio-quality setting on, a YouTube song you own in lossless plays from your copy instead. It's matched by title (ignoring YouTube extras like "Official Video" or "Remastered"), by artist, and by length to within a few seconds, so live or extended versions don't stand in. If no copy matches, the song plays from YouTube at High.
- **Quality readout.** The player shows what's playing, for example `HI-RES LOSSLESS · FLAC · 24-bit · 96 kHz · On this PC`, or `Opus · 160 kbps · YouTube Music`.

Windows mixes audio in shared mode, so your device's output sample rate still applies. ALAC, AIFF, APE and DSD can't be decoded by Chromium; your server can convert them to FLAC.

**Customisation** (Settings, with tabs):

| Tab | Options |
|---|---|
| Appearance | 8 accent presets or any colour, an accent matched to the playing song, Liquid Glass (Clear / Tinted), page colour (Obsidian / Graphite / Black), ambient glow |
| Lyrics | Size (S–XL), font (Inter / DM Sans / Segoe UI / Serif / Rounded), left or centred, line animation, blur, lyric tools on or off, with a live preview |
| Player | Background (animated mesh / blurred artwork / solid), motion (still / slow / normal), artwork size |
| Layout | Interface size (90–125%), compact song lists, start page (Home / Liked / Your Music / last page), sidebar items |

Also: Home feed, search with suggestions, album, artist and playlist pages, an Up Next queue (drag to reorder), autoplay radio when the queue runs out, shuffle and repeat, crossfade (0–10 s), volume normalisation, three audio-quality levels, keyboard shortcuts, and the queue restored on the next launch.

## The look

Apple's Liquid Glass (see 1.2 above), on the layout of [BitChord](https://github.com/kushagrasinghx/BitChord):

- BitChord's desktop/web layout: a sidebar, a floating player capsule, and a side panel for lyrics or the queue
- Its dark colour tokens, on the near-black page of BitChord's Android theme
- Album and playlist pages tinted with colours from their artwork
- The animated WebGL mesh backdrop behind the full-screen player
- Apple-Music-style lyrics, as BitChord shows them

Icons are [Lucide](https://lucide.dev) plus glyphs drawn for this app. The logo is original. Not affiliated with Apple; "Liquid Glass" describes the design language this follows.

## Run it

**Installer:** run `ObsidianMusic-Setup-1.5.1-x64.exe` (most Windows PCs, Intel/AMD) or `ObsidianMusic-Setup-1.5.1-arm64.exe` (Windows on ARM, e.g. Snapdragon). It installs for the current user (no admin needed), lets you pick the folder, adds Start menu and desktop shortcuts, and appears in Settings › Apps for uninstalling. Windows SmartScreen may warn because the installer isn't code-signed: choose **More info › Run anyway**.

**Portable build:** unzip `ObsidianMusic-1.5.1-arm64-portable.zip` and run `ObsidianMusic.exe`.

**From source** (Node 22+):

```bash
npm install
npm run dev              # development, with hot reload
npm run dist:win-arm64   # portable build for Windows on ARM
npm run dist:win-x64     # portable build for Intel/AMD Windows
```

## How it works

```
src/main/        Electron main process
  youtube.ts     YouTube Music through YouTube.js: home, search, albums, artists,
                 playlists, radio, lyrics, playlist import; normalised to plain JSON
  stream.ts      Stream resolver and the ytstream:// protocol (details below)
  library.ts     Local music folders: scanning (music-metadata), index, artwork
  subsonic.ts    Self-hosted server client (Subsonic API, token auth)
  lossless.ts    Matches YouTube songs to your lossless copies
  media.ts       media:// protocol: local files and server songs, byte ranges
  store.ts       library.json: liked songs, playlists, history, settings
  index.ts       Window, app:// protocol, IPC, taskbar buttons, tray
src/preload/     The typed bridge exposed as window.obsidian
src/renderer/    React UI (Tailwind v4, Zustand, TanStack Query)
  state/player.ts  Queue and audio engine (two decks: gapless, crossfade)
test/            Normaliser tests against real captured YouTube Music responses
```

### Playback

The `<audio>` element plays `ytstream://track/<videoId>`.

1. **Resolving the stream.** The main process tries several InnerTube clients in turn, VISIONOS first. In October 2026, BitChord measured VISIONOS returning direct audio URLs with no PO token needed. Opus at about 160 kbps is preferred. A client that refuses a track is skipped for that track for 10 minutes.
2. **Serving it.** The protocol handler answers the player's byte-range requests by fetching googlevideo in 2 MB chunks. If a URL expires or is refused partway through a song, the stream is re-resolved and continues from the same byte.

### Tests

`scripts/e2e-lossless.cjs` and `scripts/e2e-server.cjs` drive the real Electron app under Xvfb. They use generated FLAC files (16-bit, 24-bit/96 kHz, embedded and folder artwork) and a real Navidrome 0.58 server. They check scanning, byte-range streaming, matching (including rejecting live versions and MP3s), server login errors, playback with the quality badge, and that settings are saved.

The normalisers run against real YouTube Music responses (BitChord's `web/fixtures`) with no network access:

```bash
npx esbuild test/fixtures.test.ts --bundle --platform=node --format=esm --outfile=test/out.mjs \
  --banner:js="import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);"
node test/out.mjs path/to/BitChord/web/fixtures/innertube
```

### Data

Everything stays on your PC, in `%APPDATA%\Obsidian Music`:

- `library.json`: your library
- `logs\obsidian.log`: a playback log, useful if a track won't play

## Credits and licence

- Features: [Obsidian Music](https://github.com/Varun7009/Obsidian-Music) by Varun7009
- Design: [BitChord](https://github.com/kushagrasinghx/BitChord) by kushagrasinghx (GPL-3.0)
- Design language: Apple's [Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass) and [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Inter](https://rsms.me/inter/) (OFL), [YouTube.js](https://github.com/LuanRT/YouTube.js) (MIT), [am-lyrics](https://github.com/uimaxbai/am-lyrics) (MPL-2.0) and [music-metadata](https://github.com/Borewit/music-metadata) (MIT)

Licensed under GPL-3.0-or-later, as BitChord, whose design tokens it adapts.

Not affiliated with YouTube, Google, Obsidian Music or BitChord. Streaming from YouTube outside its official apps goes against YouTube's Terms of Service. Use it at your own discretion and in line with your local laws.
