// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  GitHubClient,
  GitHubApiError,
  GitHubAuthError,
  GitHubRateLimitError,
  GitHubNotFoundError,
} from "@/server/integrations/github/client";

describe("Plan 08-02: GitHubClient (Unit Tests)", () => {
  describe("1. Constructor & Token Validation", () => {
    it("throws GitHubAuthError if initialized without token", () => {
      expect(() => new GitHubClient({ token: "" })).toThrow(GitHubAuthError);
    });

    it("initializes properly with token and custom baseUrl", () => {
      const client = new GitHubClient({
        token: "ghp_validToken123",
        baseUrl: "https://github.enterprise.local/api/v3/",
      });
      expect(client).toBeInstanceOf(GitHubClient);
    });
  });

  describe("2. Request Headers & Formatting", () => {
    it("attaches required GitHub API headers and Authorization bearer", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        const headers = new Headers(init?.headers);
        headers.forEach((val, key) => {
          capturedHeaders[key] = val;
        });

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ login: "octocat", id: 1 }),
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_secret_access_token",
        fetchFn: mockFetch,
      });

      const user = await client.getUser();

      expect(user.login).toBe("octocat");
      expect(capturedUrl).toBe("https://api.github.com/user");
      expect(capturedHeaders["authorization"]).toBe("Bearer ghp_secret_access_token");
      expect(capturedHeaders["accept"]).toBe("application/vnd.github+json");
      expect(capturedHeaders["user-agent"]).toBe("LifeOS-Personal-Agent");
      expect(capturedHeaders["x-github-api-version"]).toBe("2022-11-28");
    });

    it("sends If-None-Match header when ETag is supplied", async () => {
      let capturedEtag = "";

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        capturedEtag = headers.get("if-none-match") || "";

        return {
          ok: true,
          status: 200,
          headers: new Headers({ etag: '"etag_new_789"' }),
          json: async () => [],
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_token",
        fetchFn: mockFetch,
      });

      await client.getUserEvents("octocat", { etag: '"etag_existing_123"' });
      expect(capturedEtag).toBe('"etag_existing_123"');
    });
  });

  describe("3. HTTP Status Code Handling & Cache Hit (304)", () => {
    it("handles HTTP 304 Not Modified returning empty events list with previous etag", async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 304,
          headers: new Headers({ etag: '"etag_cached_123"' }),
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_token",
        fetchFn: mockFetch,
      });

      const result = await client.getUserEvents("octocat", { etag: '"etag_cached_123"' });
      expect(result.notModified).toBe(true);
      expect(result.events).toEqual([]);
      expect(result.etag).toBe('"etag_cached_123"');
    });

    it("throws GitHubAuthError on HTTP 401 Unauthorized", async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          headers: new Headers(),
          text: async () => "Bad credentials",
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_expired",
        fetchFn: mockFetch,
      });

      await expect(client.getUser()).rejects.toThrow(GitHubAuthError);
    });

    it("throws GitHubRateLimitError on HTTP 429", async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 120;
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 429,
          headers: new Headers({
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(resetTime),
          }),
          text: async () => "Rate limit exceeded",
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_token",
        fetchFn: mockFetch,
      });

      await expect(client.getUserEvents("octocat")).rejects.toThrow(GitHubRateLimitError);
    });

    it("throws GitHubRateLimitError on HTTP 403 with x-ratelimit-remaining: 0", async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 60;
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 403,
          headers: new Headers({
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(resetTime),
          }),
          text: async () => "API rate limit exceeded for user",
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_token",
        fetchFn: mockFetch,
      });

      await expect(client.getUserEvents("octocat")).rejects.toThrow(GitHubRateLimitError);
    });

    it("throws GitHubNotFoundError on HTTP 404", async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 404,
          headers: new Headers(),
          text: async () => "Not Found",
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_token",
        fetchFn: mockFetch,
      });

      await expect(client.getRepoCommits("owner", "nonexistent-repo")).rejects.toThrow(
        GitHubNotFoundError
      );
    });
  });

  describe("4. Endpoints & Query Formatting", () => {
    it("formats getRepoCommits with query params", async () => {
      let capturedUrl = "";

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => [{ sha: "abcdef1", commit: { message: "init" } }],
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_token",
        fetchFn: mockFetch,
      });

      const commits = await client.getRepoCommits("lifeos", "core", {
        author: "hamza",
        since: "2026-09-01T00:00:00Z",
        perPage: 25,
      });

      expect(commits).toHaveLength(1);
      expect(capturedUrl).toContain("/repos/lifeos/core/commits");
      expect(capturedUrl).toContain("author=hamza");
      expect(capturedUrl).toContain("since=2026-09-01T00%3A00%3A00Z");
      expect(capturedUrl).toContain("per_page=25");
    });

    it("formats getRepoPullRequests with state and perPage params", async () => {
      let capturedUrl = "";

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => [{ id: 101, number: 12, title: "Feature X" }],
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_token",
        fetchFn: mockFetch,
      });

      const prs = await client.getRepoPullRequests("lifeos", "core", {
        state: "all",
        perPage: 30,
      });

      expect(prs).toHaveLength(1);
      expect(capturedUrl).toContain("/repos/lifeos/core/pulls");
      expect(capturedUrl).toContain("state=all");
      expect(capturedUrl).toContain("per_page=30");
    });

    it("retrieves rate limit status properly", async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            resources: {
              core: {
                limit: 5000,
                remaining: 4950,
                reset: 1700000000,
              },
            },
          }),
        } as unknown as Response;
      });

      const client = new GitHubClient({
        token: "ghp_valid",
        fetchFn: mockFetch,
      });

      const rateLimit = await client.getRateLimit();
      expect(rateLimit.limit).toBe(5000);
      expect(rateLimit.remaining).toBe(4950);
      expect(rateLimit.reset).toBe(1700000000);
    });
  });
});
