import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useLibrary } from '@/state/library';
import { useMenu } from '@/state/menu';
import { useNav } from '@/state/nav';
import { getPlayhead, usePlayer } from '@/state/player';
import { toast, useUi } from '@/state/ui';

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const player = usePlayer.getState();
      const ui = useUi.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setFullScreen(false);
        ui.focusSearch();
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        void api.toggleFullScreen();
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') return useNav.getState().back();
      if (e.altKey && e.key === 'ArrowRight') return useNav.getState().forward();
      if (typing(e.target) || ui.dialog || useMenu.getState().entries) return;
      if (e.ctrlKey && e.key === 'ArrowRight') return player.next();
      if (e.ctrlKey && e.key === 'ArrowLeft') return player.previous();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const track = player.queue[player.index]?.track;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          player.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.seek(getPlayhead() + (e.shiftKey ? 15 : 5));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.seek(getPlayhead() - (e.shiftKey ? 15 : 5));
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.setVolume(player.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.setVolume(player.volume - 0.05);
          break;
        case 'm':
        case 'M':
          player.toggleMute();
          break;
        case 's':
        case 'S':
          player.toggleShuffle();
          toast(usePlayer.getState().shuffle ? 'Shuffle on' : 'Shuffle off');
          break;
        case 'r':
        case 'R':
          player.cycleRepeat();
          toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[usePlayer.getState().repeat]);
          break;
        case 'l':
        case 'L':
          if (ui.fullScreen) break;
          ui.toggleSidePanel('lyrics');
          break;
        case 'q':
        case 'Q':
          if (ui.fullScreen) break;
          ui.toggleSidePanel('queue');
          break;
        case 'h':
        case 'H':
          if (track) toast(useLibrary.getState().toggleLike(track) ? 'Added to Liked Songs' : 'Removed from Liked Songs');
          break;
        case 'f':
        case 'F':
          if (track) ui.setFullScreen(!ui.fullScreen);
          break;
        case 'Escape':
          if (ui.fullScreen) ui.setFullScreen(false);
          else if (ui.sidePanel) ui.setSidePanel(null);
          break;
      }
    };
    const onMouse = (e: MouseEvent) => {
      // The mouse's back and forward buttons.
      if (e.button === 3) useNav.getState().back();
      if (e.button === 4) useNav.getState().forward();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, []);
}
