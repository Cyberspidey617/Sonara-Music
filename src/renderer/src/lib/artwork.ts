/**
 * YouTube Music's image CDN resizes on request. Snapping to the sizes its own
 * pages ask for keeps requests on cached variants (BitChord measured bursts of
 * odd sizes being refused with 429).
 */
const SQUARE_SIZES = [60, 120, 226, 544, 1200];
const RESIZABLE = /googleusercontent\.com|ggpht\.com/;

export function sizedArtwork(url: string | undefined, cssPx: number): string | undefined {
  if (!url) return undefined;
  if (!RESIZABLE.test(url)) return url;
  const needed = cssPx * Math.min(window.devicePixelRatio || 1, 3);
  const size = SQUARE_SIZES.find((s) => s >= needed) ?? 1200;
  return artworkAtPixels(url, size);
}

export function artworkAtPixels(url: string, px: number): string {
  if (!RESIZABLE.test(url)) return url;
  return `${url.replace(/=[^/=]*$/, '')}=w${px}-h${px}-l90-rj`;
}

/** i.ytimg.com thumbnails at their largest standard size. */
export function largeArtwork(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (RESIZABLE.test(url)) return artworkAtPixels(url, 1200);
  return url.replace(/\/(default|mqdefault|hqdefault|sddefault)\.jpg.*$/, '/maxresdefault.jpg');
}
