import { z } from "zod";

export type StorageProvider = "local" | "s3";
export type BackupStatus = "pending" | "completed" | "failed" | "verified";

export interface S3Config {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export interface BackupConfig {
  provider: StorageProvider;
  localPath?: string;
  s3Config?: S3Config;
  encrypt: boolean;
  schedule?: "disabled" | "daily" | "weekly";
}

export interface BackupManifest {
  backupId: string;
  schemaVersion: string;
  timestamp: string;
  userId: string;
  checksum: string;
  encrypted: boolean;
  entityCounts: Record<string, number>;
}

export interface BackupNoteItem {
  id: string;
  title: string;
  slug?: string;
  content: string;
  tags?: string[];
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupPayload {
  manifest: BackupManifest;
  database: Record<string, any[]>;
  notes: BackupNoteItem[];
}

export interface BackupRecordDTO {
  id: string;
  userId: string;
  storageProvider: StorageProvider;
  status: BackupStatus;
  destination: string;
  sizeBytes: number;
  checksum: string;
  encrypted: boolean;
  entityCounts: Record<string, number>;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface RestoreVerificationResult {
  valid: boolean;
  backupId: string;
  checksumMatches: boolean;
  manifest: BackupManifest | null;
  entityCounts: Record<string, number>;
  errors: string[];
}

export const s3ConfigSchema = z.object({
  bucket: z.string().min(1, "Bucket name is required"),
  region: z.string().min(1, "Region is required").default("us-east-1"),
  endpoint: z.string().url().optional(),
  accessKeyId: z.string().min(1, "Access Key ID is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
  forcePathStyle: z.boolean().optional().default(false),
});

export const backupConfigSchema = z.object({
  provider: z.enum(["local", "s3"]).default("local"),
  localPath: z.string().optional().default("./backups"),
  s3Config: s3ConfigSchema.optional(),
  encrypt: z.boolean().optional().default(false),
  schedule: z.enum(["disabled", "daily", "weekly"]).optional().default("daily"),
});

export type BackupConfigInput = z.infer<typeof backupConfigSchema>;

export const createBackupSchema = z.object({
  provider: z.enum(["local", "s3"]).optional(),
  encrypt: z.boolean().optional(),
});

export type CreateBackupInput = z.infer<typeof createBackupSchema>;
