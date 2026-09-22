import { readFileSync } from 'node:fs';

/**
 * The Crash Galaxy wordmark, vendored from the splash-screen repo.
 *
 * Read once at startup and inlined, so the page needs no second request and
 * the content-security-policy needs no external origin. `logo-invert.svg` is
 * the white artwork, drawn for a dark ground - this dashboard's ground.
 */
export const LOGO_SVG = readFileSync(new URL('./logo-invert.svg', import.meta.url), 'utf8')
  .replace(/<\?xml[^>]*\?>/, '')
  .replace('<svg', '<svg class="cg-logo" aria-label="Crash Galaxy" role="img"')
  .trim();

export const FAVICON_SVG = readFileSync(new URL('./favicon.svg', import.meta.url), 'utf8').trim();
