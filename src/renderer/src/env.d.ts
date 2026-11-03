/// <reference types="vite/client" />
import type { ObsidianApi } from '@shared/types';

declare global {
  interface Window {
    obsidian?: ObsidianApi;
  }
}

export {};
