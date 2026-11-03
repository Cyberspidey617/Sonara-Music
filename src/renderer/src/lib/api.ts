import type { ObsidianApi } from '@shared/types';

/**
 * The main process's API (preload). Outside Electron (the UI opened in a plain
 * browser for development) a mock answers instead, from bundled sample data.
 */
let api: ObsidianApi;
if (window.obsidian) {
  api = window.obsidian;
} else {
  const { createMockApi } = await import('./mockApi');
  api = createMockApi();
}
export { api };

/** IPC errors arrive as "Error invoking remote method 'x': Error: message". */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '').trim() || 'Something went wrong.';
}

export const isElectron = !!window.obsidian;
