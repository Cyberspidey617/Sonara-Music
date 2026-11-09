// The proxy setting. Off: as before (the window follows the system's proxy, Sonara's own requests go
// direct). System or a proxy you give: everything goes through it, Sonara's own requests (YouTube
// Music, streams, lyrics) included, by sending them through Chromium's network stack, which honours
// the proxy, instead of Node's.
import { net, session } from 'electron';
import type { ProxyMode } from '../shared/types';
import { log } from './log';

const nodeFetch = globalThis.fetch.bind(globalThis);
let throughChromium = false;

/** Installed once at start: every fetch in the main process goes through here. */
export function installFetch() {
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    throughChromium ? net.fetch(input as string, init as RequestInit) : nodeFetch(input, init)) as typeof fetch;
}

/** A proxy address Sonara accepts: http, https, socks4 or socks5, with a host and port. */
export function validProxy(url: string): boolean {
  return /^(https?|socks[45]):\/\/[^\s/:]+:\d{2,5}\/?$/i.test(url.trim());
}

export async function applyProxy(mode: ProxyMode | undefined, url: string | undefined) {
  try {
    if (mode === 'custom' && url && validProxy(url)) {
      await session.defaultSession.setProxy({ proxyRules: url.trim().replace(/\/$/, ''), proxyBypassRules: '<local>' });
      throughChromium = true;
    } else {
      // Chromium's own default: the system's proxy settings.
      await session.defaultSession.setProxy({ mode: 'system' });
      throughChromium = mode === 'system';
    }
    await session.defaultSession.closeAllConnections();
    log.info(`proxy: ${mode === 'custom' ? 'custom' : (mode ?? 'off')}`);
  } catch (error) {
    log.warn(`proxy not applied: ${String(error)}`);
  }
}
