import { TTLCache } from "@rakshit798/ttl-cache";

/**
 * Fixed-window rate limiter built on TTLCache.
 *
 * Each client gets a counter that expires after `windowMs`. When the
 * entry expires, the client's limit resets on its own, with no cleanup code needed.
 */
export function createRateLimiter({ max, windowMs, maxClients = 10_000 }) {
  const hits = new TTLCache({ ttl: windowMs, maxSize: maxClients, pruneInterval: windowMs });

  return {
    /**
     * @param {string} clientId e.g. the IP address
     * @returns {{ allowed: boolean, remaining: number, resetInMs: number }}
     */
    check(clientId) {
      let entry = hits.get(clientId);
      if (!entry) {
        entry = { count: 0 };
        hits.set(clientId, entry); // starts this client's window
      }

      entry.count++;
      const resetInMs = Math.max(0, Math.round(hits.ttlOf(clientId)));

      return {
        allowed: entry.count <= max,
        remaining: Math.max(0, max - entry.count),
        resetInMs,
      };
    },

    dispose() {
      hits.dispose();
    },
  };
}
