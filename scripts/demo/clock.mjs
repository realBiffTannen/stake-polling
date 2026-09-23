/**
 * Preloaded (node --import) into the web server the demo build runs, so the
 * server's clock reads the demo's moment rather than the build machine's -
 * the snapshot then says "polled a minute ago" instead of "stale". Only the
 * demo build uses this; the product never does.
 */
const offset = Number(process.env.DEMO_CLOCK_OFFSET_MS) || 0;
if (offset) {
  const real = Date.now;
  Date.now = () => real() + offset;
}
