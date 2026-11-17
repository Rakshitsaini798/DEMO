import { createServer } from "node:http";
import { createDb } from "./services/db.js";
import { createProductService } from "./services/products.js";
import { createGithubService, NotFoundError } from "./services/github.js";
import { createRateLimiter } from "./lib/rateLimiter.js";
import { createRouter, HttpError, readJson, sendJson } from "./lib/http.js";

/**
 * Build the HTTP server. Kept separate from index.js so tests can start
 * it with their own settings.
 */
export function createApp(config, { logger = console, fetchImpl } = {}) {
  const db = createDb({ delayMs: config.dbDelayMs });
  const products = createProductService({
    db,
    cacheSize: config.productCacheSize,
    ttlMs: config.productCacheTtlMs,
    logger,
  });
  const github = createGithubService({ ttlMs: config.githubCacheTtlMs, fetchImpl });
  const limiter = createRateLimiter({ max: config.rateLimitMax, windowMs: config.rateLimitWindowMs });
  const startedAt = Date.now();

  const router = createRouter();

  router.add("GET", "/", (_req, res) =>
    sendJson(res, 200, {
      message: "ttl-cache demo API",
      endpoints: [
        "GET   /products",
        "GET   /products/:id",
        "PATCH /products/:id   body: { \"stock\": 10 }",
        "GET   /github/:username",
        "GET   /stats",
      ],
    }),
  );

  router.add("GET", "/products", async (_req, res) => {
    const { products: list, cached } = await products.listProducts();
    sendJson(res, 200, list, { "X-Cache": cached ? "HIT" : "MISS" });
  });

  router.add("GET", "/products/:id", async (_req, res, { id }) => {
    const productId = parseId(id);
    const { product, cached } = await products.getProduct(productId);
    if (!product) throw new HttpError(404, `Product ${productId} not found`);
    sendJson(res, 200, product, { "X-Cache": cached ? "HIT" : "MISS" });
  });

  router.add("PATCH", "/products/:id", async (req, res, { id }) => {
    const productId = parseId(id);
    const body = await readJson(req);
    if (!Number.isInteger(body.stock) || body.stock < 0) {
      throw new HttpError(400, "stock must be a non-negative integer");
    }
    const product = await products.updateStock(productId, body.stock);
    if (!product) throw new HttpError(404, `Product ${productId} not found`);
    sendJson(res, 200, product);
  });

  router.add("GET", "/github/:username", async (_req, res, { username }) => {
    if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(username)) {
      throw new HttpError(400, "Invalid GitHub username");
    }
    try {
      const { profile, cached } = await github.getProfile(username);
      sendJson(res, 200, profile, { "X-Cache": cached ? "HIT" : "MISS" });
    } catch (err) {
      if (err instanceof NotFoundError) throw new HttpError(404, err.message);
      throw new HttpError(502, `Could not reach GitHub: ${err.message}`);
    }
  });

  router.add("GET", "/stats", (_req, res) =>
    sendJson(res, 200, {
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      databaseQueries: db.queryCount,
      productCache: products.cache.stats(),
      githubCache: github.cache.stats(),
    }),
  );

  const server = createServer(async (req, res) => {
    const started = performance.now();
    const url = new URL(req.url ?? "/", "http://localhost");

    try {
      // Rate limit every request by client IP.
      const ip = req.socket.remoteAddress ?? "unknown";
      const limit = limiter.check(ip);
      res.setHeader("X-RateLimit-Limit", config.rateLimitMax);
      res.setHeader("X-RateLimit-Remaining", limit.remaining);
      if (!limit.allowed) {
        res.setHeader("Retry-After", Math.ceil(limit.resetInMs / 1000));
        throw new HttpError(429, "Too many requests, slow down");
      }

      const { handler, params, pathMatched } = router.match(req.method ?? "GET", url.pathname);
      if (!handler) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? "Method not allowed" : "Not found");

      await handler(req, res, params);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) logger.error(err);
      if (!res.headersSent) sendJson(res, status, { error: status === 500 ? "Internal server error" : err.message });
    } finally {
      const ms = (performance.now() - started).toFixed(1);
      logger.log(`${req.method} ${url.pathname} → ${res.statusCode} ${res.getHeader("X-Cache") ?? ""} ${ms}ms`);
    }
  });

  // Stop background timers when the server closes.
  server.on("close", () => {
    products.dispose();
    limiter.dispose();
  });

  return server;
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "id must be a positive integer");
  return id;
}
