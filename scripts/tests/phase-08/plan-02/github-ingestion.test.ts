// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { GitHubSyncEngine } from "@/server/integrations/github/sync-engine";
import type { GitHubRawEvent } from "@/server/integrations/github/types";

describe("Plan 08-02: GitHub Ingestion & Event Normalization (Unit Tests)", () => {
  const engine = new GitHubSyncEngine();
  const userId = "user-test-uuid";
  const connectionId = "conn-github-123";

  describe("1. PushEvent Normalization", () => {
    it("normalizes PushEvent with multiple commits into individual commit activities", () => {
      const rawEvent: GitHubRawEvent = {
        id: "evt_push_1",
        type: "PushEvent",
        public: true,
        actor: { id: 1, login: "hamza-dev", avatar_url: "https://avatars.githubusercontent.com/u/1" },
        repo: { id: 10, name: "lifeos/core", url: "https://api.github.com/repos/lifeos/core" },
        payload: {
          ref: "refs/heads/main",
          size: 2,
          commits: [
            {
              sha: "1234567890abcdef1234567890abcdef12345678",
              author: { name: "Hamza", email: "hamza@example.com" },
              message: "feat: add external integrations architecture\n\nDetailed description here.",
              url: "https://api.github.com/repos/lifeos/core/commits/1234567890abcdef1234567890abcdef12345678",
            },
            {
              sha: "abcdef1234567890abcdef1234567890abcdef12",
              author: { name: "Hamza", email: "hamza@example.com" },
              message: "fix(backup): resolve S3 path resolution",
              url: "https://api.github.com/repos/lifeos/core/commits/abcdef1234567890abcdef1234567890abcdef12",
            },
          ],
        },
        created_at: "2026-09-30T10:00:00Z",
      };

      const activities = engine.normalizeEvent(userId, connectionId, rawEvent);

      expect(activities).toHaveLength(2);

      const [first, second] = activities;
      expect(first.userId).toBe(userId);
      expect(first.activityType).toBe("commit");
      expect(first.externalId).toBe("1234567890abcdef1234567890abcdef12345678");
      expect(first.title).toBe("feat: add external integrations architecture");
      expect(first.repository).toBe("lifeos/core");
      expect(first.metadata?.shortSha).toBe("1234567");
      expect(first.metadata?.branch).toBe("main");
      expect(first.url).toBe("https://github.com/lifeos/core/commit/1234567890abcdef1234567890abcdef12345678");

      expect(second.externalId).toBe("abcdef1234567890abcdef1234567890abcdef12");
      expect(second.title).toBe("fix(backup): resolve S3 path resolution");
    });

    it("normalizes PushEvent without commit list (e.g. tag or empty push)", () => {
      const rawEvent: GitHubRawEvent = {
        id: "evt_push_empty",
        type: "PushEvent",
        public: true,
        actor: { id: 1, login: "hamza-dev", avatar_url: "https://avatars.githubusercontent.com/u/1" },
        repo: { id: 10, name: "lifeos/core", url: "https://api.github.com/repos/lifeos/core" },
        payload: {
          ref: "refs/heads/release/v1.0",
          size: 0,
          commits: [],
        },
        created_at: "2026-09-30T10:15:00Z",
      };

      const activities = engine.normalizeEvent(userId, connectionId, rawEvent);

      expect(activities).toHaveLength(1);
      expect(activities[0].activityType).toBe("commit");
      expect(activities[0].title).toBe("Pushed to release/v1.0");
      expect(activities[0].externalId).toBe("push_evt_push_empty");
    });
  });

  describe("2. PullRequestEvent Normalization", () => {
    it("normalizes PullRequestEvent with full metadata", () => {
      const rawEvent: GitHubRawEvent = {
        id: "evt_pr_1",
        type: "PullRequestEvent",
        public: true,
        actor: { id: 1, login: "hamza-dev", avatar_url: "https://avatars.githubusercontent.com/u/1" },
        repo: { id: 10, name: "lifeos/core", url: "https://api.github.com/repos/lifeos/core" },
        payload: {
          action: "opened",
          number: 105,
          pull_request: {
            id: 999888,
            number: 105,
            title: "Support AWS S3 backup storage adapter",
            body: "This PR introduces a zero-dependency S3 SigV4 adapter.",
            html_url: "https://github.com/lifeos/core/pull/105",
            state: "open",
            merged: false,
          },
        },
        created_at: "2026-09-30T11:00:00Z",
      };

      const activities = engine.normalizeEvent(userId, connectionId, rawEvent);

      expect(activities).toHaveLength(1);
      const activity = activities[0];
      expect(activity.activityType).toBe("pull_request");
      expect(activity.title).toBe("PR #105: Support AWS S3 backup storage adapter");
      expect(activity.summary).toContain("OPENED:");
      expect(activity.url).toBe("https://github.com/lifeos/core/pull/105");
      expect(activity.metadata?.prNumber).toBe(105);
      expect(activity.metadata?.merged).toBe(false);
      expect(activity.metadata?.state).toBe("open");
    });
  });

  describe("3. IssuesEvent Normalization", () => {
    it("normalizes IssuesEvent with action and issue metadata", () => {
      const rawEvent: GitHubRawEvent = {
        id: "evt_issue_1",
        type: "IssuesEvent",
        public: true,
        actor: { id: 1, login: "hamza-dev", avatar_url: "https://avatars.githubusercontent.com/u/1" },
        repo: { id: 10, name: "lifeos/core", url: "https://api.github.com/repos/lifeos/core" },
        payload: {
          action: "closed",
          number: 42,
          issue: {
            id: 888777,
            number: 42,
            title: "Memory spike during full database export",
            body: "Need streaming or chunked export for large datasets.",
            html_url: "https://github.com/lifeos/core/issues/42",
            state: "closed",
          },
        },
        created_at: "2026-09-30T12:00:00Z",
      };

      const activities = engine.normalizeEvent(userId, connectionId, rawEvent);

      expect(activities).toHaveLength(1);
      const activity = activities[0];
      expect(activity.activityType).toBe("issue");
      expect(activity.title).toBe("Issue #42: Memory spike during full database export");
      expect(activity.summary).toContain("CLOSED:");
      expect(activity.url).toBe("https://github.com/lifeos/core/issues/42");
      expect(activity.metadata?.issueNumber).toBe(42);
      expect(activity.metadata?.action).toBe("closed");
      expect(activity.metadata?.state).toBe("closed");
    });
  });

  describe("4. ReleaseEvent Normalization", () => {
    it("normalizes ReleaseEvent with tag name and release URL", () => {
      const rawEvent: GitHubRawEvent = {
        id: "evt_rel_1",
        type: "ReleaseEvent",
        public: true,
        actor: { id: 1, login: "hamza-dev", avatar_url: "https://avatars.githubusercontent.com/u/1" },
        repo: { id: 10, name: "lifeos/core", url: "https://api.github.com/repos/lifeos/core" },
        payload: {
          action: "published",
          release: {
            id: 777666,
            tag_name: "v1.2.0",
            name: "Phase 8 Release",
            body: "Integrations milestone complete.",
            html_url: "https://github.com/lifeos/core/releases/tag/v1.2.0",
          },
        },
        created_at: "2026-09-30T13:00:00Z",
      };

      const activities = engine.normalizeEvent(userId, connectionId, rawEvent);

      expect(activities).toHaveLength(1);
      const activity = activities[0];
      expect(activity.activityType).toBe("release");
      expect(activity.title).toBe("Release Phase 8 Release");
      expect(activity.url).toBe("https://github.com/lifeos/core/releases/tag/v1.2.0");
      expect(activity.metadata?.tagName).toBe("v1.2.0");
    });
  });
});
