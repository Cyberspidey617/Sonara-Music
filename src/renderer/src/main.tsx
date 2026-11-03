import { initDownloads } from './state/downloads';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/nunito';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installGlassGlow } from './lib/glass';
import { installElasticGlass } from './lib/motion';

installGlassGlow();
installElasticGlass();
initDownloads();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
