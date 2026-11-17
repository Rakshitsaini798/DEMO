# ttl-cache-demo

A small Node.js REST API that uses the npm package [`@rakshit798/ttl-cache`](https://www.npmjs.com/package/@rakshit798/ttl-cache). It needs no framework: the only dependency is that package.

It shows three real-world uses of the package:

| Feature | What it does | Package feature used |
| --- | --- | --- |
| **Product cache** | A slow "database" (500ms) becomes instant on repeat requests | `TTLCache` + `getOrSet()` |
| **GitHub profiles** | Real GitHub API calls are cached for 5 minutes | `memoize()` |
| **Rate limiting** | Each IP gets 20 requests per minute, then a `429` | `TTLCache` with TTL as the time window |

## Run it

```bash
npm install     # downloads @rakshit798/ttl-cache from npm
npm start       # http://localhost:3000
npm run dev     # restarts automatically when you change a file
npm test        # 7 tests; no internet needed
```

## Try it

Open a second terminal while the server is running:

```bash
# 1. Caching: run this twice. The first takes about 500ms, the second about 1ms
curl -i http://localhost:3000/products/1

# 2. Update stock: this clears that product from the cache, so the next GET is fresh
curl -X PATCH http://localhost:3000/products/1 -d '{"stock": 7}'

# 3. Real GitHub API, memoized
curl -i http://localhost:3000/github/torvalds

# 4. See cache hit rates and how many DB queries were saved
curl http://localhost:3000/stats

# 5. Rate limit: the last few requests return 429
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/; done
```

Watch the `X-Cache: HIT` / `MISS` header in the responses, and the timings in the server log:

```
GET /products/1 → 200 MISS 504.6ms
GET /products/1 → 200 HIT 0.5ms
[cache] product:1 removed (deleted)
```

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | List of endpoints |
| GET | `/products` | All products (cached) |
| GET | `/products/:id` | One product (cached; concurrent requests share one DB query) |
| PATCH | `/products/:id` | Update stock with `{ "stock": 10 }` and clear the cache entry |
| GET | `/github/:username` | Public GitHub profile (memoized for 5 minutes) |
| GET | `/stats` | Cache statistics and DB query count |

## Settings

Set these as environment variables, e.g. `PORT=4000 DB_DELAY_MS=1000 npm start`.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `3000` | |
| `DB_DELAY_MS` | `500` | How slow the fake database is |
| `PRODUCT_CACHE_SIZE` | `100` | Max cached products |
| `PRODUCT_CACHE_TTL_MS` | `30000` | How long products stay cached |
| `GITHUB_CACHE_TTL_MS` | `300000` | How long GitHub profiles stay cached |
| `RATE_LIMIT_MAX` | `20` | Requests allowed per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |

## Project structure

```
src/
  index.js              starts the server
  app.js                routes and request handling
  config.js             settings from environment variables
  services/
    db.js               fake slow database
    products.js         ← TTLCache + getOrSet + evict events
    github.js           ← memoize
  lib/
    rateLimiter.js      ← TTLCache used as a rate limiter
    http.js             tiny router and JSON helpers
test/
  api.test.js           end-to-end tests with node:test
```

The files marked ← are where the package is used.
