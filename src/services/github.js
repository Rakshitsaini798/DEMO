import { memoize } from "@rakshit798/ttl-cache";

export class NotFoundError extends Error {}

/**
 * Fetch public GitHub profiles. Results are memoized, so repeated lookups
 * for the same user skip the network (and GitHub's rate limit) for `ttlMs`.
 * Failed requests are NOT cached, so they are retried next time.
 */
export function createGithubService({ ttlMs, fetchImpl = globalThis.fetch }) {
  const fetchProfile = memoize(
    async (username) => {
      const res = await fetchImpl(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers: { "User-Agent": "ttl-cache-demo", Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5_000),
      });

      if (res.status === 404) throw new NotFoundError(`GitHub user "${username}" not found`);
      if (!res.ok) throw new Error(`GitHub responded with ${res.status}`);

      const data = await res.json();
      return {
        login: data.login,
        name: data.name,
        bio: data.bio,
        publicRepos: data.public_repos,
        followers: data.followers,
        url: data.html_url,
      };
    },
    {
      ttl: ttlMs,
      maxSize: 200,
      key: (username) => String(username).toLowerCase(), // "Torvalds" and "torvalds" share a cache entry
    },
  );

  return {
    async getProfile(username) {
      const cached = fetchProfile.cache.has(String(username).toLowerCase());
      const profile = await fetchProfile(username);
      return { profile, cached };
    },
    cache: fetchProfile.cache,
  };
}
