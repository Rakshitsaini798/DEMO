import { TTLCache } from "@rakshit798/ttl-cache";

/**
 * Product service with a read-through cache.
 *
 * - getProduct: uses cache.getOrSet, so 100 requests for the same missing
 *   product at once only make ONE database query.
 * - updateStock: writes to the DB, then removes the stale cache entry.
 */
export function createProductService({ db, cacheSize, ttlMs, logger = console }) {
  const cache = new TTLCache({
    maxSize: cacheSize,
    ttl: ttlMs,
    pruneInterval: ttlMs, // clean up expired entries in the background
  });

  cache.on("evict", (key, _value, reason) => {
    logger.log(`[cache] ${key} removed (${reason})`);
  });

  return {
    cache,

    /** @returns {Promise<{ product: object | null, cached: boolean }>} */
    async getProduct(id) {
      const key = `product:${id}`;
      const cached = cache.has(key);
      const product = await cache.getOrSet(key, () => db.findProduct(id));
      return { product, cached };
    },

    async listProducts() {
      const cached = cache.has("products:all");
      const products = await cache.getOrSet("products:all", () => db.listProducts());
      return { products, cached };
    },

    async updateStock(id, stock) {
      const product = await db.updateStock(id, stock);
      if (product) {
        // Invalidate so the next read sees fresh data.
        cache.delete(`product:${id}`);
        cache.delete("products:all");
      }
      return product;
    },

    dispose() {
      cache.dispose();
    },
  };
}
