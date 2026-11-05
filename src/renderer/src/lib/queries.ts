import { QueryClient, useQuery } from '@tanstack/react-query';
import type { Taste } from '@shared/types';
import { madeForYou } from './taste';
import { api } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10 * 60_000, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => api.home(), staleTime: 30 * 60_000 });
export const useSearch = (q: string) => useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.trim().length > 0 });
/** Home's "Made for you", from your music taste; refreshed a few times a day. */
export const useMadeForYou = (taste: Taste) =>
  useQuery({
    queryKey: ['made-for-you', taste.languages, taste.genres, taste.artists.map((a) => a.id)],
    queryFn: () => madeForYou(taste),
    enabled: taste.languages.length + taste.genres.length + taste.artists.length > 0,
    staleTime: 6 * 60 * 60_000,
  });
export const useSuggestions = (q: string) =>
  useQuery({ queryKey: ['suggest', q], queryFn: () => api.suggest(q), enabled: q.trim().length > 1, staleTime: 60 * 60_000, placeholderData: (prev) => prev });
export const useAlbum = (id: string) => useQuery({ queryKey: ['album', id], queryFn: () => api.album(id) });
export const useArtist = (id: string) => useQuery({ queryKey: ['artist', id], queryFn: () => api.artist(id) });
export const usePlaylist = (id: string) => useQuery({ queryKey: ['playlist', id], queryFn: () => api.playlist(id) });
export const useLyricsFallback = (videoId: string | undefined, enabled: boolean) =>
  useQuery({ queryKey: ['lyrics', videoId], queryFn: () => api.lyrics(videoId!), enabled: !!videoId && enabled, staleTime: Infinity });
export const useLocalLibrary = () => useQuery({ queryKey: ['music', 'local'], queryFn: () => api.localLibrary(), staleTime: 5_000 });
export const useServerStatus = () => useQuery({ queryKey: ['music', 'server-status'], queryFn: () => api.serverStatus(), staleTime: 60_000 });
export const useServerAlbums = (enabled: boolean) => useQuery({ queryKey: ['music', 'server-albums'], queryFn: () => api.serverAlbums(), enabled, staleTime: 5 * 60_000 });
export const useYourAlbum = (source: 'local' | 'server', id: string) =>
  useQuery({ queryKey: ['music', 'album', source, id], queryFn: () => (source === 'local' ? api.localAlbum(id) : api.serverAlbum(id)) });
export const useYourMusicSearch = (q: string) => useQuery({ queryKey: ['music', 'search', q], queryFn: () => api.searchYourMusic(q), enabled: q.trim().length > 0, staleTime: 30_000 });
