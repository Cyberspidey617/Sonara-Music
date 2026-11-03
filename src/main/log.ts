// A small logger: the console in development, and a rolling file in the
// app's data folder, so a playback problem on someone's PC can be read later.
import fs from 'node:fs';
import path from 'node:path';

let file: string | null = null;
const MAX_BYTES = 512 * 1024;

export function configureLog(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'obsidian.log');
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      fs.renameSync(file, path.join(dir, 'obsidian.old.log'));
    }
  } catch {
    file = null;
  }
}

function write(level: string, message: string) {
  const line = `${new Date().toISOString()} ${level} ${message}`;
  if (level === 'ERROR') console.error(line);
  else console.log(line);
  if (file) {
    try {
      fs.appendFileSync(file, `${line}\n`);
    } catch {
      /* the log is best-effort */
    }
  }
}

export const log = {
  info: (m: string) => write('INFO', m),
  warn: (m: string) => write('WARN', m),
  error: (m: string) => write('ERROR', m),
  get path() {
    return file;
  },
};
