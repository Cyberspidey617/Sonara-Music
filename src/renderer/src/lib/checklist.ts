// Getting started: a few things worth trying in Sonara, each ticked off the first time you do it.
import { useLibrary } from '@/state/library';

export const STEPS = [
  { id: 'play', title: 'Start playing', body: 'Search for a song, an artist or an album, and play it.', action: 'Search' },
  { id: 'queue', title: 'Queue it up', body: 'Right-click a song: Play Next or Add to Queue. Drag songs in Up Next to reorder.', action: 'Open Up Next' },
  { id: 'mini', title: 'Try the mini player', body: 'It floats over other apps while you work. Ctrl + Alt + M from anywhere.', action: 'Try it' },
  { id: 'video', title: 'Watch a music video', body: 'In the full-screen player, the video button shows the song’s music video when there is one.', action: 'Open the player' },
  { id: 'shortcuts', title: 'Learn the shortcuts', body: 'Control Sonara from the keyboard, and from any app.', action: 'Show shortcuts' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

/** Ticks a step off (once). */
export function markStep(id: StepId) {
  const { settings, updateSettings, loaded } = useLibrary.getState();
  if (!loaded || settings.checklist?.[id]) return;
  updateSettings({ checklist: { ...settings.checklist, [id]: true } });
}
