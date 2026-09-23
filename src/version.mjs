import { readFileSync } from 'node:fs';

/** The release this code is, from package.json - shown in the dashboard footer and /healthz. */
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
