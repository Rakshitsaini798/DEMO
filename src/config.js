// All settings can be changed with environment variables, e.g.
//   PORT=4000 DB_DELAY_MS=1000 npm start

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export const config = {
  port: num("PORT", 3000),

  // How slow the fake database is, so you can see the cache working.
  dbDelayMs: num("DB_DELAY_MS", 500),

  // Product cache: how many products to keep, and for how long.
  productCacheSize: num("PRODUCT_CACHE_SIZE", 100),
  productCacheTtlMs: num("PRODUCT_CACHE_TTL_MS", 30_000),

  // GitHub profile cache.
  githubCacheTtlMs: num("GITHUB_CACHE_TTL_MS", 5 * 60_000),

  // Rate limit: max requests per IP within the window.
  rateLimitMax: num("RATE_LIMIT_MAX", 20),
  rateLimitWindowMs: num("RATE_LIMIT_WINDOW_MS", 60_000),
};
