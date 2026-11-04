// The renderer's only door to the main process: a typed, minimal API.
import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type { AppCommand, MiniGrow, MiniLayout, ObsidianApi, PlaybackState } from '../shared/types';

const api: ObsidianApi = {
  platform: process.platform,
  home: () => ipcRenderer.invoke('yt:home'),
  search: (query) => ipcRenderer.invoke('yt:search', query),
  suggest: (query) => ipcRenderer.invoke('yt:suggest', query),
  album: (id) => ipcRenderer.invoke('yt:album', id),
  artist: (id) => ipcRenderer.invoke('yt:artist', id),
  playlist: (id) => ipcRenderer.invoke('yt:playlist', id),
  upNext: (videoId, playlistId) => ipcRenderer.invoke('yt:upnext', videoId, playlistId),
  lyrics: (videoId) => ipcRenderer.invoke('yt:lyrics', videoId),
  track: (videoId) => ipcRenderer.invoke('yt:track', videoId),
  importPlaylist: (urlOrId) => ipcRenderer.invoke('yt:import', urlOrId),
  prefetch: (videoId) => ipcRenderer.invoke('stream:prefetch', videoId),
  streamInfo: (videoId) => ipcRenderer.invoke('stream:info', videoId),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: (patch) => ipcRenderer.invoke('library:save', patch),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  setPlaybackState: (state) => ipcRenderer.send('app:playback-state', state),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (handler) => {
    const listener = (_: unknown, maximized: boolean) => handler(maximized);
    ipcRenderer.on('app:maximized', listener);
    return () => ipcRenderer.removeListener('app:maximized', listener);
  },
  toggleFullScreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
  dataPath: () => ipcRenderer.invoke('app:data-path'),
  onCommand: (handler) => {
    const listener = (_: unknown, command: AppCommand) => handler(command);
    ipcRenderer.on('app:command', listener);
    return () => ipcRenderer.removeListener('app:command', listener);
  },
  toggleMiniPlayer: () => ipcRenderer.send('mini:toggle'),
  miniCommand: (command) => ipcRenderer.send('mini:command', command),
  openMainWindow: () => ipcRenderer.send('mini:open-app'),
  hideMiniPlayer: () => ipcRenderer.send('mini:hide'),
  setMiniLayout: (layout, grow) => ipcRenderer.send('mini:layout', layout, grow),
  miniJumpTo: (index) => ipcRenderer.send('mini:jump', index),
  onJumpTo: (handler) => {
    const listener = (_: unknown, index: number) => handler(index);
    ipcRenderer.on('app:jump', listener);
    return () => ipcRenderer.removeListener('app:jump', listener);
  },
  miniSeek: (seconds) => ipcRenderer.send('mini:seek', seconds),
  onSeekTo: (handler) => {
    const listener = (_: unknown, seconds: number) => handler(seconds);
    ipcRenderer.on('app:seek', listener);
    return () => ipcRenderer.removeListener('app:seek', listener);
  },
  miniMoveStart: () => ipcRenderer.send('mini:move-start'),
  miniInteractive: (on) => ipcRenderer.send('mini:interactive', on),
  miniMoveEnd: () => ipcRenderer.send('mini:move-end'),
  onMiniState: (handler) => {
    const listener = (_: unknown, state: PlaybackState, layout: MiniLayout, grow: MiniGrow) => handler(state, layout, grow);
    ipcRenderer.on('mini:state', listener);
    return () => ipcRenderer.removeListener('mini:state', listener);
  },
  setZoom: (factor) => webFrame.setZoomFactor(Math.max(0.7, Math.min(1.5, Number(factor) || 1))),
  localLibrary: () => ipcRenderer.invoke('music:library'),
  downloadTracks: (tracks, quality) => ipcRenderer.invoke('downloads:add', tracks, quality),
  cancelDownload: (videoId) => ipcRenderer.invoke('downloads:cancel', videoId),
  removeDownload: (videoId, deleteFile) => ipcRenderer.invoke('downloads:remove', videoId, deleteFile),
  listDownloads: () => ipcRenderer.invoke('downloads:list'),
  downloadsFolder: () => ipcRenderer.invoke('downloads:folder'),
  chooseDownloadsFolder: () => ipcRenderer.invoke('downloads:choose-folder'),
  openDownloadsFolder: () => ipcRenderer.invoke('downloads:open-folder'),
  showDownload: (videoId) => ipcRenderer.invoke('downloads:show', videoId),
  onDownloadsChanged: (handler) => {
    const listener = (_: unknown, items: Parameters<typeof handler>[0]) => handler(items);
    ipcRenderer.on('downloads:changed', listener);
    return () => ipcRenderer.removeListener('downloads:changed', listener);
  },
  addMusicFolder: () => ipcRenderer.invoke('music:add-folder'),
  removeMusicFolder: (folder) => ipcRenderer.invoke('music:remove-folder', folder),
  rescanMusic: () => ipcRenderer.invoke('music:rescan'),
  localAlbum: (id) => ipcRenderer.invoke('music:local-album', id),
  onScanProgress: (handler) => {
    const listener = (_: unknown, state: Parameters<typeof handler>[0]) => handler(state);
    ipcRenderer.on('music:scan-progress', listener);
    return () => ipcRenderer.removeListener('music:scan-progress', listener);
  },
  serverStatus: () => ipcRenderer.invoke('music:server-status'),
  connectServer: (login) => ipcRenderer.invoke('music:server-connect', login),
  disconnectServer: () => ipcRenderer.invoke('music:server-disconnect'),
  serverAlbums: () => ipcRenderer.invoke('music:server-albums'),
  serverAlbum: (id) => ipcRenderer.invoke('music:server-album', id),
  searchYourMusic: (query) => ipcRenderer.invoke('music:search', query),
  findOnYouTube: (title, artist) => ipcRenderer.invoke('yt:find', title, artist),
  onFullScreenChange: (handler) => {
    const listener = (_: unknown, value: boolean) => handler(value);
    ipcRenderer.on('app:fullscreen', listener);
    return () => ipcRenderer.removeListener('app:fullscreen', listener);
  },
};

contextBridge.exposeInMainWorld('obsidian', api);
