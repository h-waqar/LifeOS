// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { GoogleOAuthService } from "@/server/integrations/google-calendar/oauth-service";

describe("Plan 08-01: OAuth Credentials & Token Lifecycle (Unit Tests)", () => {
  const dummyKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  describe("1. Token Encryption & Decryption at Rest (AES-256-GCM)", () => {
    it("encrypts and decrypts OAuth access token round-trip", () => {
      const plaintextToken = "ya29.a0AfH6SMB_secret_access_token_12345";
      const encrypted = encryptSecret(plaintextToken, dummyKey);

      expect(encrypted).toMatch(/^v1:[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:[0-9a-fA-F]+/);
      expect(encrypted).not.toContain(plaintextToken);

      const decrypted = decryptSecret(encrypted, dummyKey);
      expect(decrypted).toBe(plaintextToken);
    });

    it("encrypts and decrypts OAuth refresh token round-trip", () => {
      const refreshToken = "1//04_refresh_token_very_sensitive_abcdef";
      const encrypted = encryptSecret(refreshToken, dummyKey);
      const decrypted = decryptSecret(encrypted, dummyKey);

      expect(decrypted).toBe(refreshToken);
    });

    it("rejects tampered ciphertext with authentication tag verification failure", () => {
      const plaintext = "sensitive_data";
      const encrypted = encryptSecret(plaintext, dummyKey);
      const parts = encrypted.split(":");

      // Flip characters in ciphertext
      const tamperedCiphertext = parts[3].endsWith("a")
        ? parts[3].slice(0, -1) + "b"
        : parts[3].slice(0, -1) + "a";
      const tamperedPayload = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;

      expect(() => decryptSecret(tamperedPayload, dummyKey)).toThrow(
        /authentication tag verification failed/i
      );
    });
  });

  describe("2. GoogleOAuthService Configuration & State CSRF Security", () => {
    it("detects whether Google OAuth is configured from credentials", () => {
      const unconfigured = new GoogleOAuthService({
        clientId: undefined,
        clientSecret: undefined,
      });
      expect(unconfigured.isConfigured()).toBe(false);

      const configured = new GoogleOAuthService({
        clientId: "test_client_id.apps.googleusercontent.com",
        clientSecret: "test_client_secret",
      });
      expect(configured.isConfigured()).toBe(true);
    });

    it("generates authorization URL with required scopes and CSRF state", () => {
      const oauthService = new GoogleOAuthService({
        clientId: "mock_client_id_123",
        clientSecret: "mock_client_secret_456",
        redirectUri: "http://localhost:3000/api/integrations/google-calendar/callback",
      });

      const { url, state } = oauthService.generateAuthUrl("user_test_123", "/calendar");

      expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain("client_id=mock_client_id_123");
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
      expect(url).toContain("scope=");
      expect(url).toContain(encodeURIComponent("https://www.googleapis.com/auth/calendar.events"));
      expect(url).toContain(encodeURIComponent("https://www.googleapis.com/auth/userinfo.email"));
      expect(url).toContain(`state=${encodeURIComponent(state)}`);

      // Validate decoded state
      const validation = oauthService.validateState(state, "user_test_123");
      expect(validation.isValid).toBe(true);
      expect(validation.redirectTarget).toBe("/calendar");
    });

    it("rejects OAuth state when userId does not match authenticated user", () => {
      const oauthService = new GoogleOAuthService({
        clientId: "mock_client_id_123",
        clientSecret: "mock_client_secret_456",
      });

      const { state } = oauthService.generateAuthUrl("user_alice");
      const validation = oauthService.validateState(state, "user_bob");

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("mismatch");
    });

    it("rejects expired OAuth state (older than 15 minutes)", () => {
      const oauthService = new GoogleOAuthService({
        clientId: "mock_client_id_123",
        clientSecret: "mock_client_secret_456",
      });

      const expiredPayload = {
        userId: "user_test",
        nonce: "test_nonce",
        redirectTarget: "/calendar",
        timestamp: Date.now() - 20 * 60 * 1000, // 20 minutes ago
      };
      const expiredState = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");

      const validation = oauthService.validateState(expiredState, "user_test");
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("expired");
    });

    it("rejects malformed OAuth state token", () => {
      const oauthService = new GoogleOAuthService();
      const validation = oauthService.validateState("not-valid-base64-json!!!", "user_test");
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("Malformed");
    });
  });
});
