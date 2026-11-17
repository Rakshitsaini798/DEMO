import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

const silent = { log() {}, error() {} };

/** Start the app on a random free port and return its base URL. */
async function start(overrides = {}, options = {}) {
  const config = {
    port: 0,
    dbDelayMs: 50,
    productCacheSize: 100,
    productCacheTtlMs: 30_000,
    githubCacheTtlMs: 60_000,
    rateLimitMax: 1_000,
    rateLimitWindowMs: 60_000,
    ...overrides,
  };
  const server = createApp(config, { logger: silent, ...options });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  return { server, url: `http://localhost:${port}` };
}

const stop = (server) => new Promise((resolve) => server.close(resolve));

describe("products", () => {
  let app;
  before(async () => (app = await start()));
  after(() => stop(app.server));

  it("first request is a MISS, second is a HIT and much faster", async () => {
    const t1 = performance.now();
    const first = await fetch(`${app.url}/products/1`);
    const firstMs = performance.now() - t1;

    const t2 = performance.now();
    const second = await fetch(`${app.url}/products/1`);
    const secondMs = performance.now() - t2;

    assert.equal(first.headers.get("x-cache"), "MISS");
    assert.equal(second.headers.get("x-cache"), "HIT");
    assert.deepEqual(await first.json(), await second.json());
    assert.ok(secondMs < firstMs, `cached (${secondMs}ms) should beat uncached (${firstMs}ms)`);
  });

  it("concurrent requests for the same product make only one DB query", async () => {
    const before = await (await fetch(`${app.url}/stats`)).json();
    await Promise.all(Array.from({ length: 20 }, () => fetch(`${app.url}/products/2`)));
    const after = await (await fetch(`${app.url}/stats`)).json();

    assert.equal(after.databaseQueries - before.databaseQueries, 1);
  });

  it("PATCH updates stock and clears the stale cache entry", async () => {
    await fetch(`${app.url}/products/3`); // warm the cache

    const patch = await fetch(`${app.url}/products/3`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock: 99 }),
    });
    assert.equal(patch.status, 200);

    const after = await fetch(`${app.url}/products/3`);
    assert.equal(after.headers.get("x-cache"), "MISS");
    assert.equal((await after.json()).stock, 99);
  });

  it("returns helpful errors", async () => {
    assert.equal((await fetch(`${app.url}/products/999`)).status, 404);
    assert.equal((await fetch(`${app.url}/products/abc`)).status, 400);
    assert.equal((await fetch(`${app.url}/nope`)).status, 404);
    assert.equal((await fetch(`${app.url}/products/1`, { method: "DELETE" })).status, 405);

    const bad = await fetch(`${app.url}/products/1`, { method: "PATCH", body: '{"stock": -5}' });
    assert.equal(bad.status, 400);
  });
});

describe("github", () => {
  let app;
  let calls = 0;

  // Fake fetch, so the tests don't depend on the internet.
  const fakeFetch = async (url) => {
    calls++;
    const user = url.split("/").pop();
    if (user === "ghost-user") return new Response("{}", { status: 404 });
    return Response.json({ login: user, name: "Test", public_repos: 3, followers: 7, html_url: `https://github.com/${user}` });
  };

  before(async () => (app = await start({}, { fetchImpl: fakeFetch })));
  after(() => stop(app.server));

  it("memoizes profiles case-insensitively", async () => {
    const a = await fetch(`${app.url}/github/Octocat`);
    const b = await fetch(`${app.url}/github/octocat`);
    assert.equal(a.headers.get("x-cache"), "MISS");
    assert.equal(b.headers.get("x-cache"), "HIT");
    assert.equal(calls, 1);
  });

  it("maps a missing user to 404 and does not cache the failure", async () => {
    assert.equal((await fetch(`${app.url}/github/ghost-user`)).status, 404);
    await new Promise((r) => setImmediate(r));
    assert.equal((await fetch(`${app.url}/github/ghost-user`)).status, 404);
    assert.equal(calls, 3); // 1 from the previous test + 2 here, so the error wasn't cached
  });
});

describe("rate limiting", () => {
  let app;
  before(async () => (app = await start({ rateLimitMax: 3 })));
  after(() => stop(app.server));

  it("blocks requests over the limit with 429", async () => {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await fetch(`${app.url}/`)).status);

    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    const blocked = await fetch(`${app.url}/`);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  });
});
