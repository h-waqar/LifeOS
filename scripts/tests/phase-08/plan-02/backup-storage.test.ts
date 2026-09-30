// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LocalStorageAdapter } from "@/server/integrations/backup/storage/local-adapter";
import { S3StorageAdapter } from "@/server/integrations/backup/storage/s3-adapter";

describe("Plan 08-02: Backup Storage Adapters (Unit Tests)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeos-storage-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("1. LocalStorageAdapter", () => {
    it("saves and reads content correctly", async () => {
      const adapter = new LocalStorageAdapter(tempDir);
      const testContent = JSON.stringify({ message: "backup data payload" });

      const savedPath = await adapter.save("2026/09/backup.json", testContent);
      expect(savedPath).toContain("backup.json");

      const exists = await adapter.exists("2026/09/backup.json");
      expect(exists).toBe(true);

      const readBuffer = await adapter.read("2026/09/backup.json");
      expect(readBuffer.toString("utf-8")).toBe(testContent);
    });

    it("lists files matching prefix", async () => {
      const adapter = new LocalStorageAdapter(tempDir);
      await adapter.save("user-1/backup-1.json", "data1");
      await adapter.save("user-1/backup-2.json", "data2");
      await adapter.save("user-2/backup-3.json", "data3");

      const user1List = await adapter.list("user-1");
      expect(user1List).toHaveLength(2);
      expect(user1List).toContain("user-1/backup-1.json");
      expect(user1List).toContain("user-1/backup-2.json");

      const allList = await adapter.list();
      expect(allList).toHaveLength(3);
    });

    it("deletes files cleanly and exists returns false", async () => {
      const adapter = new LocalStorageAdapter(tempDir);
      await adapter.save("delete-me.json", "temporary");
      expect(await adapter.exists("delete-me.json")).toBe(true);

      await adapter.delete("delete-me.json");
      expect(await adapter.exists("delete-me.json")).toBe(false);
    });

    it("prevents directory traversal attacks", async () => {
      const adapter = new LocalStorageAdapter(tempDir);
      await expect(adapter.save("../../../etc/passwd", "evil")).rejects.toThrow();
    });
  });

  describe("2. S3StorageAdapter (Zero-Dependency SigV4)", () => {
    it("validates required configuration keys", () => {
      expect(
        () =>
          new S3StorageAdapter({
            bucket: "",
            accessKeyId: "",
            secretAccessKey: "",
          })
      ).toThrow("S3StorageAdapter requires bucket, accessKeyId, and secretAccessKey");
    });

    it("executes PUT request with AWS SigV4 Authorization headers", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any;

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedMethod = init?.method || "GET";
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = init?.body;

        return {
          ok: true,
          status: 200,
          text: async () => "",
        } as unknown as Response;
      });

      const adapter = new S3StorageAdapter(
        {
          bucket: "lifeos-backups",
          region: "eu-central-1",
          accessKeyId: "AKIAIOSFODNN7EXAMPLE",
          secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        },
        mockFetch
      );

      const content = JSON.stringify({ version: "1.0", data: "test" });
      const resultUrl = await adapter.save("backups/user-123/archive.json", content);

      expect(resultUrl).toBe("https://lifeos-backups.s3.eu-central-1.amazonaws.com/backups/user-123/archive.json");
      expect(capturedUrl).toBe("https://lifeos-backups.s3.eu-central-1.amazonaws.com/backups/user-123/archive.json");
      expect(capturedMethod).toBe("PUT");
      expect(capturedHeaders["Authorization"]).toContain("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/");
      expect(capturedHeaders["Authorization"]).toContain("/eu-central-1/s3/aws4_request");
      expect(capturedHeaders["Authorization"]).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date");
      expect(capturedHeaders["Authorization"]).toContain("Signature=");
      expect(capturedHeaders["x-amz-date"]).toBeDefined();
      expect(capturedHeaders["x-amz-content-sha256"]).toBeDefined();
      expect(Buffer.isBuffer(capturedBody)).toBe(true);
    });

    it("executes GET request and returns Buffer", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        const payload = Buffer.from(JSON.stringify({ restored: true }));
        const arrayBuf = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => arrayBuf,
        } as unknown as Response;
      });

      const adapter = new S3StorageAdapter(
        {
          bucket: "lifeos-backups",
          region: "us-east-1",
          accessKeyId: "KEY",
          secretAccessKey: "SECRET",
        },
        mockFetch
      );

      const buffer = await adapter.read("backups/archive.json");
      expect(JSON.parse(buffer.toString("utf-8"))).toEqual({ restored: true });
    });

    it("checks exists with HEAD request returning true for 200 and false for 404", async () => {
      let headStatus = 200;
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: headStatus === 200,
          status: headStatus,
        } as unknown as Response;
      });

      const adapter = new S3StorageAdapter(
        {
          bucket: "my-bucket",
          accessKeyId: "KEY",
          secretAccessKey: "SECRET",
        },
        mockFetch
      );

      expect(await adapter.exists("existing.json")).toBe(true);

      headStatus = 404;
      expect(await adapter.exists("missing.json")).toBe(false);
    });

    it("supports custom endpoint with forcePathStyle (e.g. MinIO / Cloudflare R2)", async () => {
      let capturedUrl = "";
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          text: async () => "",
        } as unknown as Response;
      });

      const adapter = new S3StorageAdapter(
        {
          bucket: "custom-bucket",
          endpoint: "http://127.0.0.1:9000",
          forcePathStyle: true,
          accessKeyId: "MINIO_KEY",
          secretAccessKey: "MINIO_SECRET",
        },
        mockFetch
      );

      await adapter.save("test.json", "{}");
      expect(capturedUrl).toBe("http://127.0.0.1:9000/custom-bucket/test.json");
    });

    it("throws error when S3 response is not ok", async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 403,
          text: async () => "Access Denied",
        } as unknown as Response;
      });

      const adapter = new S3StorageAdapter(
        {
          bucket: "my-bucket",
          accessKeyId: "KEY",
          secretAccessKey: "SECRET",
        },
        mockFetch
      );

      await expect(adapter.save("denied.json", "{}")).rejects.toThrow("S3 PUT failed with status 403: Access Denied");
    });
  });
});
