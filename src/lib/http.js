// Tiny helpers so we don't need Express.

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

export async function readJson(req, limitBytes = 10_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, "Request body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body must be valid JSON");
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Minimal router: router.add("GET", "/products/:id", handler)
 * Handlers receive (req, res, params).
 */
export function createRouter() {
  const routes = [];

  return {
    add(method, pattern, handler) {
      const keys = [];
      const regex = new RegExp(
        "^" +
          pattern.replace(/:(\w+)/g, (_, key) => {
            keys.push(key);
            return "([^/]+)";
          }) +
          "/?$",
      );
      routes.push({ method, regex, keys, handler });
    },

    match(method, pathname) {
      let pathMatched = false;
      for (const route of routes) {
        const m = pathname.match(route.regex);
        if (!m) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return { handler: route.handler, params };
      }
      return { handler: null, pathMatched };
    },
  };
}
