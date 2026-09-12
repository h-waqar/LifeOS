import { describe, it, expect } from "vitest";
import { updatePreferencesSchema } from "@/server/preferences/service";
import { dynamic as preferencesDynamic } from "@/app/api/preferences/route";
import nextConfig from "../../../../next.config";

describe("Plan 01-06 Unit: API & Application Boundary Hardening", () => {
  describe("Next.js Route Configuration & Browser Security Headers", () => {
    it("enforces dynamic = 'force-dynamic' on preferences route handler", () => {
      expect(preferencesDynamic).toBe("force-dynamic");
    });

    it("verifies security headers configuration in next.config.ts", async () => {
      expect(typeof nextConfig.headers).toBe("function");
      const headersList = await nextConfig.headers!();
      const globalConfig = headersList.find((h) => h.source === "/:path*");
      expect(globalConfig).toBeDefined();

      const map = new Map(globalConfig!.headers.map((h: { key: string; value: string }) => [h.key.toLowerCase(), h.value]));
      expect(map.get("x-frame-options")).toBe("DENY");
      expect(map.get("x-content-type-options")).toBe("nosniff");
      expect(map.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(map.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
      expect(map.get("x-xss-protection")).toBe("0");
      expect(map.get("cross-origin-opener-policy")).toBe("same-origin");
    });
  });

  describe("updatePreferencesSchema Adversarial Input Sanitization", () => {
    it("strictly forbids any script or HTML injection in dateFormat", () => {
      expect(updatePreferencesSchema.safeParse({ dateFormat: "<script>alert(1)</script>" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "><script src='bad'></script>" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "<svg onload=alert(1)>" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "javascript:alert(1)" }).success).toBe(false);
    });

    it("strictly forbids null bytes and ASCII control characters in dateFormat", () => {
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY\0MM" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY\x00MM" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY\x1fMM" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY\x7fMM" }).success).toBe(false);
    });

    it("accepts valid global date formats", () => {
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY-MM-DD" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "DD/MM/YYYY" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "MM/DD/YYYY" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY.MM.DD" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "YYYY/MM/DD" }).success).toBe(true);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "D MMM YYYY" }).success).toBe(true);
    });

    it("enforces strict key control (rejects unexpected keys)", () => {
      expect(updatePreferencesSchema.safeParse({ theme: "dark", userId: "attacker" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", role: "admin" }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", isAdmin: true }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", singleUserLock: false }).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ theme: "dark", hackKey: "payload" }).success).toBe(false);
    });

    it("rejects non-object primitives and oversized strings", () => {
      expect(updatePreferencesSchema.safeParse(null).success).toBe(false);
      expect(updatePreferencesSchema.safeParse(undefined).success).toBe(false);
      expect(updatePreferencesSchema.safeParse("").success).toBe(false);
      expect(updatePreferencesSchema.safeParse(12345).success).toBe(false);
      expect(updatePreferencesSchema.safeParse([1, 2, 3]).success).toBe(false);
      expect(updatePreferencesSchema.safeParse({ dateFormat: "Y".repeat(33) }).success).toBe(false);
    });
  });
});
