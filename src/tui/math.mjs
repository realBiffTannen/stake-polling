/**
 * The math checks live in src/math/checks.mjs - they are pure and the web
 * dashboard uses them too. This re-export keeps every existing TUI import
 * path working, so moving the file changed no behaviour.
 */
export * from '../math/checks.mjs';
