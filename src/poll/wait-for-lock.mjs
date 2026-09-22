/**
 * Wait for the poller lock rather than exiting when somebody else holds it.
 *
 * `npm start` may be run while a poller is already going in another terminal
 * or a screen session. That poller is doing its job, so this one follows:
 * it retries until the lease expires on its own. It never deletes the key and
 * never signals the holder - two pollers would double every delta, and a
 * stolen lock is how you get two.
 */
export async function waitForLock(lock, { retryMs = 30000, signal, onWait } = {}) {
  // Track abort state to avoid listener accumulation; register once outside the loop.
  let aborted = false;
  const abortHandler = () => { aborted = true; };
  signal?.addEventListener('abort', abortHandler);

  try {
    for (;;) {
      if (aborted) return false;
      if (await lock.acquire()) return true;
      if (onWait) onWait(await lock.holder());
      // Wait for the retry interval. When abort fires, we set aborted=true via abortHandler
      // and this promise resolves immediately via onceHandler, so the next iteration detects the abort.
      await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(), retryMs);
        const onceHandler = () => { clearTimeout(timer); resolve(); };
        signal?.addEventListener('abort', onceHandler, { once: true });
      });
    }
  } finally {
    signal?.removeEventListener('abort', abortHandler);
  }
}
