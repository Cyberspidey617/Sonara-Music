import { create } from 'zustand';
import { api, isElectron } from '@/lib/api';

/**
 * Whether Sonara can reach the internet. Windows' own signal says when the network goes away; a
 * request that fails for want of a connection says so too (Windows can report "connected" with no
 * internet). While offline it checks again every few seconds, so it notices the connection's return.
 */
export const useOnline = create<{ online: boolean }>(() => ({ online: typeof navigator === 'undefined' || navigator.onLine }));

let recheck: ReturnType<typeof setInterval> | null = null;
function setOnline(online: boolean) {
  if (useOnline.getState().online !== online) useOnline.setState({ online });
  if (online && recheck) {
    clearInterval(recheck);
    recheck = null;
  } else if (!online && !recheck && isElectron) {
    recheck = setInterval(() => void api.isOnline().then((ok) => ok && setOnline(true), () => undefined), 6000);
  }
}

/** A request failed with no connection. */
export const markOffline = () => setOnline(false);
/** Asks again now (the offline screen's Try again). */
export const checkOnline = () => (isElectron ? api.isOnline().then(setOnline, () => setOnline(false)) : Promise.resolve());

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void checkOnline());
  window.addEventListener('offline', () => setOnline(false));
  if (!navigator.onLine) setOnline(false);
}
