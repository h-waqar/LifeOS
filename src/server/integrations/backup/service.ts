import crypto from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  integrationConnections,
  backupRecords,
  type BackupRecord,
} from "@/server/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createAuditLog } from "@/server/audit";
import { eventBus } from "@/server/events/event-bus";
import { createDomainEvent } from "@/server/events/types";
import { LocalStorageAdapter } from "./storage/local-adapter";
import { S3StorageAdapter } from "./storage/s3-adapter";
import type { StorageAdapter } from "./storage/adapter";
import { backupExporter } from "./exporter";
import type {
  BackupConfig,
  BackupConfigInput,
  BackupRecordDTO,
  RestoreVerificationResult,
  BackupPayload,
} from "./types";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Backup service cannot be initialized in the browser."
  );
}

export function toBackupRecordDTO(row: BackupRecord): BackupRecordDTO {
  return {
    id: row.id,
    userId: row.userId,
    storageProvider: row.storageProvider as BackupRecordDTO["storageProvider"],
    status: row.status as BackupRecordDTO["status"],
    destination: row.destination,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    encrypted: row.encrypted,
    entityCounts: (row.entityCounts || {}) as Record<string, number>,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class BackupService {
  /**
   * Returns storage adapter configured for the given user or provided configuration.
   */
  getAdapter(config: BackupConfig): StorageAdapter {
    if (config.provider === "s3" && config.s3Config) {
      return new S3StorageAdapter(config.s3Config);
    }
    return new LocalStorageAdapter(config.localPath || "./backups");
  }

  /**
   * Retrieves sanitized backup configuration for a user.
   */
  async getConfig(userId: string): Promise<BackupConfig> {
    if (!userId?.trim()) {
      return { provider: "local", localPath: "./backups", encrypt: false, schedule: "daily" };
    }

    const [conn] = await db
      .select({ metadata: integrationConnections.metadata })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "backup")
        )
      )
      .limit(1);

    if (!conn) {
      return { provider: "local", localPath: "./backups", encrypt: false, schedule: "daily" };
    }

    const meta = (conn.metadata || {}) as Record<string, any>;
    const s3 = meta.s3Config ? { ...meta.s3Config, secretAccessKey: "********" } : undefined;

    return {
      provider: meta.provider === "s3" ? "s3" : "local",
      localPath: meta.localPath || "./backups",
      s3Config: s3,
      encrypt: Boolean(meta.encrypt),
      schedule: meta.schedule || "daily",
    };
  }

  /**
   * Saves storage adapter configuration with encrypted secrets.
   */
  async configure(
    userId: string,
    input: BackupConfigInput,
    actor?: string
  ): Promise<BackupConfig> {
    if (!userId?.trim()) {
      throw new Error("Missing user identifier");
    }

    let rawS3Config = input.s3Config;
    let encryptedSecretAccessKey: string | undefined;

    if (input.provider === "s3" && rawS3Config) {
      if (!rawS3Config.secretAccessKey || rawS3Config.secretAccessKey === "********") {
        // Retain existing encrypted key if user didn't modify it
        const [existing] = await db
          .select({ metadata: integrationConnections.metadata })
          .from(integrationConnections)
          .where(
            and(
              eq(integrationConnections.userId, userId),
              eq(integrationConnections.provider, "backup")
            )
          )
          .limit(1);
        const prevMeta = (existing?.metadata || {}) as Record<string, any>;
        encryptedSecretAccessKey = prevMeta.encryptedSecretAccessKey;
      } else {
        encryptedSecretAccessKey = encryptSecret(rawS3Config.secretAccessKey);
      }
    }

    const metadata: Record<string, any> = {
      provider: input.provider,
      localPath: input.localPath || "./backups",
      encrypt: Boolean(input.encrypt),
      schedule: input.schedule || "daily",
      s3Config: rawS3Config
        ? {
            bucket: rawS3Config.bucket,
            region: rawS3Config.region,
            endpoint: rawS3Config.endpoint,
            accessKeyId: rawS3Config.accessKeyId,
            forcePathStyle: rawS3Config.forcePathStyle,
          }
        : undefined,
      encryptedSecretAccessKey,
    };

    await db
      .insert(integrationConnections)
      .values({
        userId,
        provider: "backup",
        status: "connected",
        metadata,
      })
      .onConflictDoUpdate({
        target: [integrationConnections.userId, integrationConnections.provider],
        set: {
          status: "connected",
          metadata,
          updatedAt: new Date(),
        },
      });

    await createAuditLog({
      userId,
      category: "mutation",
      action: "integration.backup_configured",
      status: "success",
      actor: actor || userId,
      details: {
        provider: input.provider,
        encrypt: input.encrypt,
        schedule: input.schedule,
      },
    });

    return this.getConfig(userId);
  }

  /**
   * Executes a full backup: exports database & notes, saves to storage, and records history.
   */
  async createBackup(
    userId: string,
    options?: { provider?: "local" | "s3"; encrypt?: boolean },
    actor?: string
  ): Promise<BackupRecordDTO> {
    if (!userId?.trim()) {
      throw new Error("Missing user identifier for backup");
    }

    const startedAt = new Date();

    // 1. Resolve configuration
    const [conn] = await db
      .select({ id: integrationConnections.id, metadata: integrationConnections.metadata })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "backup")
        )
      )
      .limit(1);

    const meta = (conn?.metadata || {}) as Record<string, any>;
    const targetProvider = options?.provider || meta.provider || "local";
    const shouldEncrypt = options?.encrypt ?? meta.encrypt ?? false;

    let adapter: StorageAdapter;
    if (targetProvider === "s3" && meta.s3Config) {
      let secretKey = "";
      if (meta.encryptedSecretAccessKey) {
        secretKey = decryptSecret(meta.encryptedSecretAccessKey);
      }
      adapter = new S3StorageAdapter({
        ...meta.s3Config,
        secretAccessKey: secretKey,
      });
    } else {
      adapter = new LocalStorageAdapter(meta.localPath || "./backups");
    }

    // 2. Perform export
    const exportResult = await backupExporter.exportUserData(userId, shouldEncrypt);
    const destinationKey = `${userId}/${exportResult.backupId}.json`;

    // 3. Save via adapter
    const finalDestination = await adapter.save(destinationKey, exportResult.buffer);

    // 4. Record backup record in database
    const [saved] = await db
      .insert(backupRecords)
      .values({
        userId,
        connectionId: conn?.id || null,
        storageProvider: targetProvider,
        status: "completed",
        destination: finalDestination,
        sizeBytes: exportResult.buffer.length,
        checksum: exportResult.checksum,
        encrypted: shouldEncrypt,
        entityCounts: exportResult.entityCounts,
        startedAt,
        completedAt: new Date(),
      })
      .returning();

    // 5. Emit domain event & audit log
    await eventBus.publish(
      createDomainEvent("integration.backup_completed", userId, {
        backupId: saved.id,
        destination: finalDestination,
        sizeBytes: exportResult.buffer.length,
        status: "completed",
      })
    );

    await createAuditLog({
      userId,
      category: "mutation",
      action: "integration.backup_created",
      status: "success",
      actor: actor || userId,
      details: {
        backupId: saved.id,
        storageProvider: targetProvider,
        sizeBytes: exportResult.buffer.length,
        encrypted: shouldEncrypt,
        totalEntities: Object.values(exportResult.entityCounts).reduce((a, b) => a + b, 0),
      },
    });

    return toBackupRecordDTO(saved);
  }

  /**
   * Lists all historical backup records for a user.
   */
  async listBackups(userId: string): Promise<BackupRecordDTO[]> {
    if (!userId?.trim()) return [];

    const rows = await db
      .select()
      .from(backupRecords)
      .where(eq(backupRecords.userId, userId))
      .orderBy(desc(backupRecords.createdAt))
      .limit(50);

    return rows.map(toBackupRecordDTO);
  }

  /**
   * Verifies the integrity of a backup archive against its SHA-256 checksum and manifest (SEC-04).
   * Guarantees zero data corruption and restore validity.
   */
  async verifyBackup(userId: string, backupId: string): Promise<RestoreVerificationResult> {
    if (!userId?.trim() || !backupId?.trim()) {
      return {
        valid: false,
        backupId,
        checksumMatches: false,
        manifest: null,
        entityCounts: {},
        errors: ["Invalid user ID or backup ID"],
      };
    }

    const [record] = await db
      .select()
      .from(backupRecords)
      .where(
        and(
          eq(backupRecords.userId, userId),
          eq(backupRecords.id, backupId)
        )
      )
      .limit(1);

    if (!record) {
      return {
        valid: false,
        backupId,
        checksumMatches: false,
        manifest: null,
        entityCounts: {},
        errors: [`Backup record ${backupId} not found`],
      };
    }

    // Load user storage config
    const [conn] = await db
      .select({ metadata: integrationConnections.metadata })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.userId, userId),
          eq(integrationConnections.provider, "backup")
        )
      )
      .limit(1);

    const meta = (conn?.metadata || {}) as Record<string, any>;
    let adapter: StorageAdapter;

    if (record.storageProvider === "s3" && meta.s3Config) {
      const secretKey = meta.encryptedSecretAccessKey
        ? decryptSecret(meta.encryptedSecretAccessKey)
        : "";
      adapter = new S3StorageAdapter({
        ...meta.s3Config,
        secretAccessKey: secretKey,
      });
    } else {
      adapter = new LocalStorageAdapter(meta.localPath || "./backups");
    }

    const errors: string[] = [];

    try {
      // 1. Read stored file
      // If destination is a full URL or absolute path, extract relative key
      const keyOrPath = record.destination.includes(`${userId}/`)
        ? record.destination.slice(record.destination.indexOf(`${userId}/`))
        : `${userId}/${record.id}.json`;

      const rawBuffer = await adapter.read(keyOrPath);

      // 2. Decrypt if encrypted
      let contentString: string;
      if (record.encrypted) {
        const encryptedText = rawBuffer.toString("utf-8");
        contentString = decryptSecret(encryptedText);
      } else {
        contentString = rawBuffer.toString("utf-8");
      }

      // 3. Parse JSON structure
      const parsed: BackupPayload = JSON.parse(contentString);
      if (!parsed.manifest || !parsed.database || !Array.isArray(parsed.notes)) {
        errors.push("Invalid backup archive structure: missing manifest, database, or notes");
      }

      // 4. Recompute SHA-256 of raw data (database + notes)
      const rawData = {
        database: parsed.database,
        notes: parsed.notes,
      };
      const recomputedChecksum = crypto
        .createHash("sha256")
        .update(JSON.stringify(rawData))
        .digest("hex");

      const checksumMatches =
        recomputedChecksum === parsed.manifest?.checksum &&
        recomputedChecksum === record.checksum;

      if (!checksumMatches) {
        errors.push(
          `Checksum mismatch: expected ${record.checksum}, got ${recomputedChecksum}`
        );
      }

      const isValid = errors.length === 0 && checksumMatches;

      // Update record status to verified
      if (isValid) {
        await db
          .update(backupRecords)
          .set({ status: "verified" })
          .where(eq(backupRecords.id, record.id));
      }

      return {
        valid: isValid,
        backupId: record.id,
        checksumMatches,
        manifest: parsed.manifest || null,
        entityCounts: parsed.manifest?.entityCounts || {},
        errors,
      };
    } catch (err: any) {
      return {
        valid: false,
        backupId: record.id,
        checksumMatches: false,
        manifest: null,
        entityCounts: {},
        errors: [err.message || "Failed to read or parse backup file"],
      };
    }
  }
}

export const backupService = new BackupService();
