import { QueryCache, QueryClient, useQuery } from '@tanstack/react-query';
import { markOffline } from '@/state/online';
import type { Taste } from '@shared/types';
import { daypart, madeForYou, type TasteSignals } from './taste';
import { api, errorMessage } from './api';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (error) => /Check your internet connection/.test(errorMessage(error)) && markOffline() }),
  defaultOptions: {
    queries: { staleTime: 10 * 60_000, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => api.home(), staleTime: 30 * 60_000 });
export const useSearch = (q: string) => useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.trim().length > 0 });
/** Home's "Made for you": your picks, your listening and what you've told Sonara; refreshed a few times a day. */
export const useMadeForYou = (taste: Taste, feedback: Pick<TasteSignals, 'notInterested' | 'notInterestedArtists' | 'tasteExcluded' | 'notes'>) =>
  useQuery({
    // A new part of the day brings a new daylist.
    queryKey: ['made-for-you', taste.languages, taste.genres, taste.artists.map((a) => a.id), feedback, daypart().name],
    queryFn: async () => madeForYou(taste, { ...feedback, profile: await api.listeningProfile(60).catch(() => null) }),
    staleTime: 3 * 60 * 60_000,
    // Saying "Not interested" refreshes it: the old shelves stay up meanwhile.
    placeholderData: (previous) => previous,
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
