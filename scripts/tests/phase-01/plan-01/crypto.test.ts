import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, encryptJSON, decryptJSON } from "@/lib/crypto";

describe("AES-256-GCM Crypto Utility", () => {
  const validKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const alternateKey = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  describe("Key Validation and Length Checks", () => {
    it("throws when key is not 64 hex characters (too short)", () => {
      expect(() => encryptSecret("secret", "0123456789abcdef")).toThrow(
        /must be a valid 64-character hexadecimal string/
      );
    });

    it("throws when key contains non-hex characters", () => {
      const invalidHex = "g".repeat(64);
      expect(() => encryptSecret("secret", invalidHex)).toThrow(
        /must be a valid 64-character hexadecimal string/
      );
    });

    it("throws when key is undefined and env variable is unset", () => {
      const originalEnv = process.env.LIFEOS_ENCRYPTION_KEY;
      try {
        delete process.env.LIFEOS_ENCRYPTION_KEY;
        expect(() => encryptSecret("secret")).toThrow(/LIFEOS_ENCRYPTION_KEY/);
      } finally {
        process.env.LIFEOS_ENCRYPTION_KEY = originalEnv;
      }
    });
  });

  describe("Round-Trip Encryption and Decryption", () => {
    it("encrypts and decrypts a plaintext secret successfully", () => {
      const secret = "LifeOS-Master-Secret-Token-12345!";
      const encrypted = encryptSecret(secret, validKey);

      expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
      const decrypted = decryptSecret(encrypted, validKey);
      expect(decrypted).toBe(secret);
    });

    it("encrypts and decrypts complex unicode strings", () => {
      const unicodeSecret = "🔑 Personal Operating System 🚀 — 汉字 / 日本語 / العربية";
      const encrypted = encryptSecret(unicodeSecret, validKey);
      const decrypted = decryptSecret(encrypted, validKey);
      expect(decrypted).toBe(unicodeSecret);
    });

    it("produces distinct ciphertexts and distinct IVs for identical plaintexts (IV uniqueness)", () => {
      const secret = "identical-secret-value";
      const encrypted1 = encryptSecret(secret, validKey);
      const encrypted2 = encryptSecret(secret, validKey);

      expect(encrypted1).not.toBe(encrypted2);
      const iv1 = encrypted1.split(":")[1];
      const iv2 = encrypted2.split(":")[1];
      expect(iv1).not.toBe(iv2);

      expect(decryptSecret(encrypted1, validKey)).toBe(secret);
      expect(decryptSecret(encrypted2, validKey)).toBe(secret);
    });

    it("encrypts and decrypts JSON objects via encryptJSON and decryptJSON", () => {
      const sampleObject = {
        apiKey: "sk-proj-xyz123",
        provider: "openai",
        metadata: {
          rpmLimit: 500,
          enabled: true,
          tags: ["production", "ai-layer"],
        },
      };

      const encrypted = encryptJSON(sampleObject, validKey);
      const decrypted = decryptJSON<typeof sampleObject>(encrypted, validKey);
      expect(decrypted).toEqual(sampleObject);
    });
  });

  describe("Tamper Protection and Authentication Failure Rejection", () => {
    it("rejects decryption if ciphertext has been modified", () => {
      const secret = "super-confidential-data";
      const encrypted = encryptSecret(secret, validKey);
      const parts = encrypted.split(":");

      // Flip the last byte of the ciphertext
      const originalCiphertext = parts[3];
      const tamperedLastChar = originalCiphertext.endsWith("a") ? "b" : "a";
      const tamperedCiphertext = originalCiphertext.slice(0, -1) + tamperedLastChar;
      const tamperedPayload = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;

      expect(() => decryptSecret(tamperedPayload, validKey)).toThrow(
        /authentication tag verification failed/
      );
    });

    it("rejects decryption if authentication tag has been tampered with", () => {
      const secret = "super-confidential-data";
      const encrypted = encryptSecret(secret, validKey);
      const parts = encrypted.split(":");

      // Flip a character in auth tag
      const originalTag = parts[2];
      const tamperedTag = (originalTag.startsWith("0") ? "1" : "0") + originalTag.slice(1);
      const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedTag}:${parts[3]}`;

      expect(() => decryptSecret(tamperedPayload, validKey)).toThrow(
        /authentication tag verification failed/
      );
    });

    it("rejects decryption if IV has been tampered with", () => {
      const secret = "super-confidential-data";
      const encrypted = encryptSecret(secret, validKey);
      const parts = encrypted.split(":");

      // Flip a character in IV
      const originalIv = parts[1];
      const tamperedIv = (originalIv.startsWith("0") ? "1" : "0") + originalIv.slice(1);
      const tamperedPayload = `${parts[0]}:${tamperedIv}:${parts[2]}:${parts[3]}`;

      expect(() => decryptSecret(tamperedPayload, validKey)).toThrow(
        /authentication tag verification failed/
      );
    });

    it("fails decryption when attempted with a different key", () => {
      const secret = "super-confidential-data";
      const encrypted = encryptSecret(secret, validKey);

      expect(() => decryptSecret(encrypted, alternateKey)).toThrow(
        /authentication tag verification failed/
      );
    });

    it("rejects payloads with invalid version or segment count", () => {
      expect(() => decryptSecret("invalid-payload", validKey)).toThrow(
        /Invalid encrypted payload format/
      );
      expect(() => decryptSecret("v2:12:34:56", validKey)).toThrow(
        /Invalid encrypted payload format/
      );
    });

    it("rejects payloads with malformed or non-hex IVs", () => {
      // 23 hex chars (odd/short)
      expect(() =>
        decryptSecret("v1:0123456789abcdef0123456:0123456789abcdef0123456789abcdef:aabb", validKey)
      ).toThrow(/Invalid IV format/);

      // 24 chars containing non-hex 'g'
      expect(() =>
        decryptSecret("v1:0123456789abcdef0123456g:0123456789abcdef0123456789abcdef:aabb", validKey)
      ).toThrow(/Invalid IV format/);

      // 25 hex chars (too long)
      expect(() =>
        decryptSecret("v1:0123456789abcdef012345678:0123456789abcdef0123456789abcdef:aabb", validKey)
      ).toThrow(/Invalid IV format/);
    });

    it("rejects payloads with malformed or non-hex authentication tags", () => {
      // 31 hex chars (too short)
      expect(() =>
        decryptSecret("v1:0123456789abcdef01234567:0123456789abcdef0123456789abcde:aabb", validKey)
      ).toThrow(/Invalid auth tag format/);

      // 32 chars containing non-hex 'z'
      expect(() =>
        decryptSecret("v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdz0:aabb", validKey)
      ).toThrow(/Invalid auth tag format/);

      // 33 hex chars (too long)
      expect(() =>
        decryptSecret("v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdef0:aabb", validKey)
      ).toThrow(/Invalid auth tag format/);
    });

    it("rejects payloads with malformed or non-hex ciphertext", () => {
      // Odd-length ciphertext (3 hex digits)
      expect(() =>
        decryptSecret("v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdef:abc", validKey)
      ).toThrow(/Invalid ciphertext format/);

      // Non-hex characters in ciphertext
      expect(() =>
        decryptSecret("v1:0123456789abcdef01234567:0123456789abcdef0123456789abcdef:12zz", validKey)
      ).toThrow(/Invalid ciphertext format/);
    });

    it("encrypts and decrypts an empty string successfully", () => {
      const emptySecret = "";
      const encrypted = encryptSecret(emptySecret, validKey);
      expect(encrypted).toMatch(/^v1:[0-9a-f]{24}:[0-9a-f]{32}:$/);
      const decrypted = decryptSecret(encrypted, validKey);
      expect(decrypted).toBe(emptySecret);
    });
  });
});
