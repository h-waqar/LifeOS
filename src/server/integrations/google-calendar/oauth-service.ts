import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { integrationConnections } from "@/server/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { createAuditLog } from "@/server/audit";
import type {
  GoogleTokenResponse,
  GoogleUserInfo,
  GoogleCalendarConnectionDTO,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Google OAuth service cannot be initialized in the browser."
  );
}

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export interface GoogleOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export class GoogleOAuthService {
  private config: GoogleOAuthConfig;

  constructor(customConfig?: GoogleOAuthConfig) {
    this.config = {
      clientId: customConfig?.clientId ?? process.env.GOOGLE_CLIENT_ID,
      clientSecret: customConfig?.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET,
      redirectUri:
        customConfig?.redirectUri ??
        process.env.GOOGLE_REDIRECT_URI ??
        `${env.BETTER_AUTH_URL}/api/integrations/google-calendar/callback`,
    };
  }

  /**
   * Returns true if Google OAuth credentials (client ID & secret) are configured in the environment.
   */
  isConfigured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret);
  }

  /**
   * Generates a secure OAuth authorization URL with CSRF state token.
   */
  generateAuthUrl(
    userId: string,
    redirectTarget = "/calendar"
  ): { url: string; state: string } {
    if (!this.config.clientId) {
      throw new Error(
        "Google Calendar integration is not configured. GOOGLE_CLIENT_ID is missing."
      );
    }

    const statePayload = {
      userId,
      nonce: crypto.randomUUID(),
      redirectTarget,
      timestamp: Date.now(),
    };

    const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri!,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return {
      url: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
      state,
    };
  }

  /**
   * Validates state parameter to protect against CSRF attacks.
   * Enforces 15-minute maximum TTL.
   */
  validateState(
    state: string,
    expectedUserId: string
  ): { isValid: boolean; redirectTarget: string; error?: string } {
    try {
      const decoded = Buffer.from(state, "base64url").toString("utf-8");
      const payload = JSON.parse(decoded) as {
        userId?: string;
        nonce?: string;
        redirectTarget?: string;
        timestamp?: number;
      };

      if (!payload.userId || payload.userId !== expectedUserId) {
        return {
          isValid: false,
          redirectTarget: "/calendar",
          error: "OAuth state user mismatch.",
        };
      }

      const now = Date.now();
      const maxAgeMs = 15 * 60 * 1000; // 15 minutes
      if (!payload.timestamp || now - payload.timestamp > maxAgeMs) {
        return {
          isValid: false,
          redirectTarget: "/calendar",
          error: "OAuth state has expired. Please initiate connection again.",
        };
      }

      return {
        isValid: true,
        redirectTarget: payload.redirectTarget || "/calendar",
      };
    } catch {
      return {
        isValid: false,
        redirectTarget: "/calendar",
        error: "Malformed OAuth state token.",
      };
    }
  }

  /**
   * Exchanges authorization code for Google access and refresh tokens.
   */
  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error(
        "Google OAuth credentials missing: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set."
      );
    }

    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri!,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Google OAuth token exchange failed (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as GoogleTokenResponse;
    return data;
  }

  /**
   * Fetches user email identity from Google userinfo endpoint.
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Failed to fetch Google user info (${response.status}): ${errBody}`);
    }

    const data = (await response.json()) as GoogleUserInfo;
    return data;
  }

  /**
   * Connects or updates a Google Calendar integration in PostgreSQL with encrypted tokens.
   */
  async handleOAuthCallback(
    userId: string,
    code: string,
    actor?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ connectionId: string; email?: string }> {
    const tokens = await this.exchangeCodeForTokens(code);
    const userInfo = await this.getUserInfo(tokens.access_token);

    const encryptedAccessToken = encryptSecret(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : null;

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Look for existing connection
    const [existing] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "google_calendar")
        )
      )
      .limit(1);

    let connectionId: string;

    if (existing) {
      connectionId = existing.id;
      // If no new refresh_token was returned (user reconnected without consent prompt reset), preserve previous refresh token
      const refreshTokenToStore =
        encryptedRefreshToken ?? existing.encryptedRefreshToken;

      await db
        .update(integrationConnections)
        .set({
          status: "connected",
          encryptedAccessToken,
          encryptedRefreshToken: refreshTokenToStore,
          tokenExpiresAt,
          scope: tokens.scope ?? existing.scope,
          externalAccountId: userInfo.email ?? existing.externalAccountId,
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, existing.id));
    } else {
      connectionId = crypto.randomUUID();
      await db.insert(integrationConnections).values({
        id: connectionId,
        userId,
        provider: "google_calendar",
        status: "connected",
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        scope: tokens.scope,
        externalAccountId: userInfo.email ?? null,
        metadata: {
          calendarId: "primary",
        },
      });
    }

    await createAuditLog({
      userId,
      category: "system",
      action: "connect_integration",
      status: "success",
      actor: "user",
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
      details: {
        provider: "google_calendar",
        accountEmail: userInfo.email,
        connectionId,
      },
    });

    return { connectionId, email: userInfo.email };
  }

  /**
   * Retrieves a valid, in-memory decrypted access token.
   * Automatically refreshes expired tokens using the encrypted refresh token.
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const [connection] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "google_calendar")
        )
      )
      .limit(1);

    if (!connection || connection.status !== "connected") {
      throw new Error("Google Calendar integration is not connected for this user.");
    }

    if (!connection.encryptedAccessToken) {
      throw new Error("No access token found for Google Calendar integration.");
    }

    const now = Date.now();
    const expiresAt = connection.tokenExpiresAt
      ? connection.tokenExpiresAt.getTime()
      : 0;

    // If token has at least 5 minutes remaining, use it directly
    if (expiresAt - now > 5 * 60 * 1000) {
      return decryptSecret(connection.encryptedAccessToken);
    }

    // Refresh token needed
    if (!connection.encryptedRefreshToken) {
      await db
        .update(integrationConnections)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(integrationConnections.id, connection.id));

      throw new Error(
        "Google Calendar access token expired and no refresh token is stored. Reconnect required."
      );
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Google client credentials missing for token refresh.");
    }

    const decryptedRefreshToken = decryptSecret(connection.encryptedRefreshToken);

    const refreshResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: decryptedRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!refreshResponse.ok) {
      const errText = await refreshResponse.text();
      // If Google rejected refresh token (e.g. revoked access), mark expired
      await db
        .update(integrationConnections)
        .set({
          status: "expired",
          metadata: {
            ...((connection.metadata as Record<string, unknown>) ?? {}),
            lastRefreshError: errText,
          },
          updatedAt: new Date(),
        })
        .where(eq(integrationConnections.id, connection.id));

      throw new Error(`Google token refresh failed: ${errText}`);
    }

    const newTokens = (await refreshResponse.json()) as GoogleTokenResponse;
    const newEncryptedAccessToken = encryptSecret(newTokens.access_token);
    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

    await db
      .update(integrationConnections)
      .set({
        encryptedAccessToken: newEncryptedAccessToken,
        tokenExpiresAt: newExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    return newTokens.access_token;
  }

  /**
   * Returns sanitized connection status DTO for presentation.
   * Never exposes raw tokens or secret values.
   */
  async getConnectionStatus(userId: string): Promise<GoogleCalendarConnectionDTO> {
    const [connection] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "google_calendar")
        )
      )
      .limit(1);

    if (!connection) {
      return {
        connected: false,
        status: "disconnected",
        accountEmail: null,
        scope: null,
        lastSyncedAt: null,
      };
    }

    const meta = (connection.metadata as Record<string, unknown>) ?? {};

    return {
      connected: connection.status === "connected",
      status: connection.status as GoogleCalendarConnectionDTO["status"],
      accountEmail: connection.externalAccountId,
      scope: connection.scope,
      lastSyncedAt: (meta.lastSyncedAt as string) ?? null,
      syncStats: {
        totalMappings: typeof meta.totalMappings === "number" ? meta.totalMappings : 0,
        lastSyncStatus: meta.lastSyncStatus as GoogleCalendarConnectionDTO["syncStats"] extends { lastSyncStatus?: infer S } ? S : undefined,
        lastErrorMessage: (meta.lastErrorMessage as string) ?? null,
      },
    };
  }

  /**
   * Disconnects the Google Calendar integration and revokes credentials.
   */
  async disconnect(
    userId: string,
    actor?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const [connection] = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "google_calendar")
        )
      )
      .limit(1);

    if (!connection) {
      return;
    }

    // Best-effort token revocation
    if (connection.encryptedAccessToken) {
      try {
        const token = decryptSecret(connection.encryptedAccessToken);
        await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }).catch(() => {
          // Ignore revocation network failures
        });
      } catch {
        // Ignore decryption failure on disconnect
      }
    }

    await db
      .update(integrationConnections)
      .set({
        status: "disconnected",
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connection.id));

    await createAuditLog({
      userId,
      category: "system",
      action: "disconnect_integration",
      status: "success",
      actor: "user",
      ipAddress: actor?.ipAddress,
      userAgent: actor?.userAgent,
      details: {
        provider: "google_calendar",
        connectionId: connection.id,
      },
    });
  }
}

export const googleOAuthService = new GoogleOAuthService();
