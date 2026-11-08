import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryClient } from '@/lib/queries';
import { useLibrary } from '@/state/library';
import { restoreQueue, usePlayer } from '@/state/player';
import { AppShell } from '@/shell/AppShell';
import { lastRoute, useNav } from '@/state/nav';
import { startListeningLog } from '@/lib/listening';

export function App() {
  const loaded = useLibrary((s) => s.loaded);
  useEffect(() => {
    void useLibrary
      .getState()
      .load()
      .then(() => {
        // The Liquid Glass redesign: earlier installs pick up its new defaults once.
        const before = useLibrary.getState().settings;
        if ((before.designVersion ?? 1) < 2) {
          useLibrary.getState().updateSettings({
            designVersion: 2,
            lyricsFont: before.lyricsFont === 'dm-sans' ? 'inter' : before.lyricsFont,
            glassStyle: before.glassStyle ?? 'clear',
          });
        }
        const settings = useLibrary.getState().settings;
        usePlayer.setState({ volume: settings.volume });
        restoreQueue();
        startListeningLog();
        const nav = useNav.getState();
        if (settings.startPage === 'liked') nav.go({ name: 'liked' }, { replace: true });
        else if (settings.startPage === 'music') nav.go({ name: 'music' }, { replace: true });
        else if (settings.startPage === 'last') {
          const route = lastRoute();
          if (route) nav.go(route, { replace: true });
        }
      });
  }, []);
  if (!loaded) return <div className="h-full bg-page" />;
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
