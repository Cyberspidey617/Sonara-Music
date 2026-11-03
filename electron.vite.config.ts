import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/*
 * am-lyrics animates short words letter by letter, but leaves connected
 * right-to-left scripts whole. Indic, Thai, Lao, Tibetan, Myanmar and Khmer
 * scripts also join letters with vowel signs, and split apart they render as
 * dotted circles, so they're kept whole too.
 */
function amLyricsComplexScripts(): Plugin {
  const from = "if (/[\\u0590-\\u08ff]/.test(text)) return 'none';";
  const to = "if (/[\\u0590-\\u08ff\\u0900-\\u0dff\\u0e00-\\u0eff\\u0f00-\\u109f\\u1780-\\u17ff\\ua980-\\uaadf]/.test(text)) return 'none';";
  return {
    name: 'am-lyrics-complex-scripts',
    transform(code, id) {
      if (!id.includes('am-lyrics') || !code.includes(from)) return null;
      return code.replace(from, to);
    },
  };
}

export default defineConfig({
  main: {
    build: {
      // YouTube.js is ESM-only; bundling it keeps the main process a single CJS file.
      externalizeDeps: { exclude: ['youtubei.js'] },
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src'), '@shared': resolve(__dirname, 'src/shared') } },
    plugins: [react(), tailwindcss(), amLyricsComplexScripts()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
});
