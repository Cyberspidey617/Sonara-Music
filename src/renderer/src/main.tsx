import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/nunito';
import './styles/global.css';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// macOS draws its own window buttons (top-left); Windows and Linux use the app's (shell/WindowControls).
document.documentElement.dataset.platform = /Mac/.test(navigator.platform) ? 'mac' : /Linux/.test(navigator.platform) ? 'linux' : 'windows';

const render = (node: ReactNode) => createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>);

if (new URLSearchParams(location.search).has('mini')) {
  // The mini player's own window: just its pebble, on a see-through window (no player, no library).
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  void import('./shell/MiniPlayer').then(({ MiniPlayer }) => render(<MiniPlayer />));
} else {
  void Promise.all([import('./App'), import('./state/downloads'), import('./lib/glass'), import('./lib/motion')]).then(([{ App }, downloads, glass, motion]) => {
    glass.installGlassGlow();
    motion.installElasticGlass();
    downloads.initDownloads();
    render(<App />);
  });
}
