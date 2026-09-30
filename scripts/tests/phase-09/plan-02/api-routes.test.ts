// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as goalForecastGet } from "@/app/api/goals/[id]/forecast/route";
import { GET as goalsForecastBatchGet } from "@/app/api/goals/forecast/route";
import {
  GET as semanticSearchGet,
  POST as semanticSearchPost,
} from "@/app/api/search/semantic/route";
import { POST as semanticIndexPost } from "@/app/api/search/semantic/index/route";
import { GET as semanticStatusGet } from "@/app/api/search/semantic/status/route";
import * as authGuard from "@/server/auth/guard";
import * as goalForecastService from "@/server/goals/forecasting/service";
import * as semanticSearchService from "@/server/search/semantic-service";
import * as indexingService from "@/server/search/indexing-service";
import { NotFoundError } from "@/server/goals/service";

describe("Plan 09-02: API Routes (Goal Forecasting & Semantic Search)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockUser = {
    id: "user_plan_09_02",
    email: "test@lifeos.app",
    name: "Tester",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    singleUserLock: true,
  };

  const mockSession = {
    id: "session_09_02",
    userId: "user_plan_09_02",
    token: "tok_09_02",
    expiresAt: new Date(Date.now() + 3600 * 1000),
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe("1. GET /api/goals/[id]/forecast", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/goals/goal-123/forecast");
      const res = await goalForecastGet(req, {
        params: Promise.resolve({ id: "goal-123" }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Authentication required");
      expect(res.headers.get("Cache-Control")).toContain("private, no-cache");
    });

    it("returns 404 when goal is not found", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });
      vi.spyOn(goalForecastService, "getGoalRiskForecast").mockRejectedValue(
        new NotFoundError("Goal not found")
      );

      const req = new NextRequest("http://localhost:3000/api/goals/non-existent/forecast");
      const res = await goalForecastGet(req, {
        params: Promise.resolve({ id: "non-existent" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Goal not found");
    });

    it("returns 403 when goal belongs to another user (ownership violation)", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });
      vi.spyOn(goalForecastService, "getGoalRiskForecast").mockRejectedValue(
        new authGuard.AuthorizationError("You do not own this goal")
      );

      const req = new NextRequest("http://localhost:3000/api/goals/other-goal/forecast");
      const res = await goalForecastGet(req, {
        params: Promise.resolve({ id: "other-goal" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("You do not own this goal");
    });

    it("returns 200 with forecast data on success", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockForecast: any = {
        goalId: "goal-123",
        title: "Master Machine Learning",
        status: "in_progress",
        currentProgress: 45,
        targetDate: "2026-12-31",
        riskLevel: "medium_risk",
        riskScore: 42,
        primaryFactors: [],
        recommendations: [],
      };

      vi.spyOn(goalForecastService, "getGoalRiskForecast").mockResolvedValue(mockForecast);

      const req = new NextRequest("http://localhost:3000/api/goals/goal-123/forecast");
      const res = await goalForecastGet(req, {
        params: Promise.resolve({ id: "goal-123" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(mockForecast);
      expect(goalForecastService.getGoalRiskForecast).toHaveBeenCalledWith("user_plan_09_02", "goal-123");
    });
  });

  describe("2. GET /api/goals/forecast", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/goals/forecast");
      const res = await goalsForecastBatchGet(req);

      expect(res.status).toBe(401);
    });

    it("returns 400 when query parameter is invalid", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const req = new NextRequest("http://localhost:3000/api/goals/forecast?horizon=infinite");
      const res = await goalsForecastBatchGet(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid forecast query parameters");
    });

    it("returns 200 with forecasts summary when authenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockSummary: any = {
        forecasts: [],
        riskDistribution: { on_track: 2, low_risk: 1, medium_risk: 0, high_risk: 0, critical: 0, completed: 1 },
        totalActiveGoals: 3,
        averageRiskScore: 18,
      };

      vi.spyOn(goalForecastService, "getAllGoalsRiskForecasts").mockResolvedValue(mockSummary);

      const req = new NextRequest("http://localhost:3000/api/goals/forecast?area=career");
      const res = await goalsForecastBatchGet(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(mockSummary);
      expect(goalForecastService.getAllGoalsRiskForecasts).toHaveBeenCalledWith("user_plan_09_02", {
        area: "career",
      });
    });
  });

  describe("3. GET & POST /api/search/semantic", () => {
    it("returns 401 on GET when unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/search/semantic?q=machine+learning");
      const res = await semanticSearchGet(req);

      expect(res.status).toBe(401);
    });

    it("returns 400 on GET when query parameter is missing", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const req = new NextRequest("http://localhost:3000/api/search/semantic");
      const res = await semanticSearchGet(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Search query 'q' parameter is required");
    });

    it("returns 400 on GET when limit exceeds maximum limit", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const req = new NextRequest("http://localhost:3000/api/search/semantic?q=ai&limit=100");
      const res = await semanticSearchGet(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("Invalid semantic search query parameters");
    });

    it("returns 200 on GET with search results", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockSearchResult: any = {
        results: [
          {
            id: "emb-1",
            entityType: "note",
            entityId: "note-1",
            title: "Transformers Architecture",
            similarityScore: 0.88,
          },
        ],
        totalMatches: 1,
        query: "attention mechanism",
        executionTimeMs: 12,
        model: "text-embedding-004",
      };

      vi.spyOn(semanticSearchService, "searchSemantic").mockResolvedValue(mockSearchResult);

      const req = new NextRequest(
        "http://localhost:3000/api/search/semantic?q=attention+mechanism&threshold=0.7&limit=5"
      );
      const res = await semanticSearchGet(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(mockSearchResult);
      expect(semanticSearchService.searchSemantic).toHaveBeenCalledWith("user_plan_09_02", {
        query: "attention mechanism",
        threshold: 0.7,
        limit: 5,
        offset: 0,
        entityType: undefined,
        area: undefined,
      });
    });

    it("returns 200 on POST with search results from json body", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockSearchResult: any = {
        results: [],
        totalMatches: 0,
        query: "knowledge graph",
        executionTimeMs: 8,
        model: "text-embedding-004",
      };

      vi.spyOn(semanticSearchService, "searchSemantic").mockResolvedValue(mockSearchResult);

      const req = new NextRequest("http://localhost:3000/api/search/semantic", {
        method: "POST",
        body: JSON.stringify({
          query: "knowledge graph",
          threshold: 0.6,
          limit: 10,
          area: "career",
        }),
      });

      const res = await semanticSearchPost(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(mockSearchResult);
      expect(semanticSearchService.searchSemantic).toHaveBeenCalledWith("user_plan_09_02", {
        query: "knowledge graph",
        threshold: 0.6,
        limit: 10,
        offset: 0,
        entityType: undefined,
        area: "career",
      });
    });
  });

  describe("4. POST /api/search/semantic/index", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/search/semantic/index", {
        method: "POST",
      });
      const res = await semanticIndexPost(req);

      expect(res.status).toBe(401);
    });

    it("returns 200 with index summary on success", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockSummary = {
        indexedCount: 15,
        chunksCount: 22,
        failedCount: 0,
        errors: [],
        durationMs: 340,
      };

      vi.spyOn(indexingService, "indexAllKnowledge").mockResolvedValue(mockSummary);

      const req = new NextRequest("http://localhost:3000/api/search/semantic/index", {
        method: "POST",
        body: JSON.stringify({ force: true }),
      });
      const res = await semanticIndexPost(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(mockSummary);
      expect(indexingService.indexAllKnowledge).toHaveBeenCalledWith("user_plan_09_02", {
        force: true,
      });
    });
  });

  describe("5. GET /api/search/semantic/status", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockRejectedValue(
        new authGuard.AuthenticationError()
      );

      const req = new NextRequest("http://localhost:3000/api/search/semantic/status");
      const res = await semanticStatusGet(req);

      expect(res.status).toBe(401);
    });

    it("returns 200 with embedding status", async () => {
      vi.spyOn(authGuard, "requireAuthenticatedUser").mockResolvedValue({
        user: mockUser,
        session: mockSession,
      });

      const mockStatus: any = {
        totalEmbeddings: 42,
        totalEntities: 30,
        embeddingsByType: { note: 20, learning_item: 12, content_item: 10 },
        hasPgvectorExtension: true,
        defaultModel: "text-embedding-004",
      };

      vi.spyOn(indexingService, "getEmbeddingStatus").mockResolvedValue(mockStatus);

      const req = new NextRequest("http://localhost:3000/api/search/semantic/status");
      const res = await semanticStatusGet(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual(mockStatus);
      expect(indexingService.getEmbeddingStatus).toHaveBeenCalledWith("user_plan_09_02");
    });
  });
});
