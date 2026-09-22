/**
 * Where this dashboard can be reached from.
 *
 * Printed at startup so the other machines on the network have a URL to open
 * without anybody having to look up an IP.
 */
export function lanUrls(port, interfaces) {
  const out = [`http://localhost:${port}`];
  for (const entries of Object.values(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family !== 'IPv4' && entry.family !== 4) continue;
      out.push(`http://${entry.address}:${port}`);
    }
  }
  return out;
}
