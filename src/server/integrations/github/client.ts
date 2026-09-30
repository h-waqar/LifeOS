import type { GitHubRawEvent, GitHubUser } from "./types";

export class GitHubApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 500, code = "GITHUB_API_ERROR", details?: unknown) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class GitHubAuthError extends GitHubApiError {
  constructor(message = "GitHub authentication failed: invalid or expired token") {
    super(message, 401, "GITHUB_AUTH_ERROR");
    this.name = "GitHubAuthError";
  }
}

export class GitHubRateLimitError extends GitHubApiError {
  readonly resetAt: Date;

  constructor(message = "GitHub API rate limit exceeded", resetTimestamp?: number) {
    super(message, 429, "GITHUB_RATE_LIMIT");
    this.name = "GitHubRateLimitError";
    this.resetAt = resetTimestamp ? new Date(resetTimestamp * 1000) : new Date(Date.now() + 60_000);
  }
}

export class GitHubNotFoundError extends GitHubApiError {
  constructor(message = "GitHub resource not found") {
    super(message, 404, "GITHUB_NOT_FOUND");
    this.name = "GitHubNotFoundError";
  }
}

export interface GitHubClientOptions {
  token: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class GitHubClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: GitHubClientOptions) {
    if (!options.token) {
      throw new GitHubAuthError("Missing GitHub access token");
    }
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.fetch = options.fetchFn ?? fetch;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { etag?: string } = {}
  ): Promise<{ data: T; headers: Headers; status: number; notModified?: boolean }> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers || {});

    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("User-Agent", "LifeOS-Personal-Agent");
    headers.set("X-GitHub-Api-Version", "2022-11-28");

    if (options.etag) {
      headers.set("If-None-Match", options.etag);
    }

    const response = await this.fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 304) {
      return {
        data: null as unknown as T,
        headers: response.headers,
        status: 304,
        notModified: true,
      };
    }

    if (response.status === 401) {
      throw new GitHubAuthError();
    }

    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const resetHeader = response.headers.get("x-ratelimit-reset");
      if (remaining === "0" || response.status === 429) {
        const resetTimestamp = resetHeader ? parseInt(resetHeader, 10) : undefined;
        throw new GitHubRateLimitError(
          "GitHub API rate limit exceeded",
          resetTimestamp
        );
      }
    }

    if (response.status === 404) {
      throw new GitHubNotFoundError(`GitHub resource at ${endpoint} not found`);
    }

    if (!response.ok) {
      let errorBody: any = null;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new GitHubApiError(
        errorBody?.message || `GitHub API request failed with status ${response.status}`,
        response.status,
        "GITHUB_REQUEST_FAILED",
        errorBody
      );
    }

    const data = await response.json();
    return { data, headers: response.headers, status: response.status };
  }

  /**
   * Fetches authenticated user profile.
   */
  async getUser(): Promise<GitHubUser> {
    const res = await this.request<GitHubUser>("/user");
    return res.data;
  }

  /**
   * Fetches recent events performed by a user (public and private if token has scope).
   */
  async getUserEvents(
    username: string,
    options: { page?: number; perPage?: number; etag?: string } = {}
  ): Promise<{ events: GitHubRawEvent[]; etag?: string; notModified: boolean }> {
    const params = new URLSearchParams();
    if (options.page) params.set("page", String(options.page));
    if (options.perPage) params.set("per_page", String(options.perPage));

    const query = params.toString() ? `?${params.toString()}` : "";
    const endpoint = `/users/${encodeURIComponent(username)}/events${query}`;

    const res = await this.request<GitHubRawEvent[]>(endpoint, {
      etag: options.etag,
    });

    if (res.notModified) {
      return { events: [], etag: options.etag, notModified: true };
    }

    const newEtag = res.headers.get("etag") || undefined;
    return { events: res.data || [], etag: newEtag, notModified: false };
  }

  /**
   * Fetches commits from a specific repository.
   */
  async getRepoCommits(
    owner: string,
    repo: string,
    options: { since?: string; author?: string; perPage?: number } = {}
  ): Promise<any[]> {
    const params = new URLSearchParams();
    if (options.since) params.set("since", options.since);
    if (options.author) params.set("author", options.author);
    if (options.perPage) params.set("per_page", String(options.perPage));

    const query = params.toString() ? `?${params.toString()}` : "";
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits${query}`;

    const res = await this.request<any[]>(endpoint);
    return res.data || [];
  }

  /**
   * Fetches pull requests from a repository.
   */
  async getRepoPullRequests(
    owner: string,
    repo: string,
    options: { state?: "open" | "closed" | "all"; perPage?: number } = {}
  ): Promise<any[]> {
    const params = new URLSearchParams();
    if (options.state) params.set("state", options.state);
    if (options.perPage) params.set("per_page", String(options.perPage));

    const query = params.toString() ? `?${params.toString()}` : "";
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls${query}`;

    const res = await this.request<any[]>(endpoint);
    return res.data || [];
  }

  /**
   * Fetches issues from a repository.
   */
  async getRepoIssues(
    owner: string,
    repo: string,
    options: { state?: "open" | "closed" | "all"; since?: string; perPage?: number } = {}
  ): Promise<any[]> {
    const params = new URLSearchParams();
    if (options.state) params.set("state", options.state);
    if (options.since) params.set("since", options.since);
    if (options.perPage) params.set("per_page", String(options.perPage));

    const query = params.toString() ? `?${params.toString()}` : "";
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues${query}`;

    const res = await this.request<any[]>(endpoint);
    return res.data || [];
  }

  /**
   * Returns current rate limit information.
   */
  async getRateLimit(): Promise<{ limit: number; remaining: number; reset: number }> {
    const res = await this.request<any>("/rate_limit");
    const core = res.data?.resources?.core;
    return {
      limit: core?.limit ?? 5000,
      remaining: core?.remaining ?? 5000,
      reset: core?.reset ?? Math.floor(Date.now() / 1000) + 3600,
    };
  }
}
