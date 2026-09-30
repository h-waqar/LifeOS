"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import type {
  GitHubConnectionDTO,
  BackupConfig,
  BackupRecordDTO,
  StorageProvider,
} from "@/types";
import {
  Github,
  Cloud,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Lock,
  Download,
  Trash2,
  Loader2,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

export function IntegrationsSettingsView() {
  // GitHub State
  const [githubConn, setGithubConn] = React.useState<GitHubConnectionDTO | null>(null);
  const [githubLoading, setGithubLoading] = React.useState(true);
  const [githubToken, setGithubToken] = React.useState("");
  const [githubRepos, setGithubRepos] = React.useState("");
  const [githubWebhookSecret, setGithubWebhookSecret] = React.useState("");
  const [connectingGithub, setConnectingGithub] = React.useState(false);
  const [syncingGithub, setSyncingGithub] = React.useState(false);

  // Backup State
  const [backupConfig, setBackupConfig] = React.useState<BackupConfig | null>(null);
  const [backups, setBackups] = React.useState<BackupRecordDTO[]>([]);
  const [backupLoading, setBackupLoading] = React.useState(true);
  const [savingBackupConfig, setSavingBackupConfig] = React.useState(false);
  const [creatingBackup, setCreatingBackup] = React.useState(false);
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null);

  // Backup form inputs
  const [provider, setProvider] = React.useState<StorageProvider>("local");
  const [localPath, setLocalPath] = React.useState("./backups");
  const [s3Bucket, setS3Bucket] = React.useState("");
  const [s3Region, setS3Region] = React.useState("us-east-1");
  const [s3Endpoint, setS3Endpoint] = React.useState("");
  const [s3AccessKey, setS3AccessKey] = React.useState("");
  const [s3SecretKey, setS3SecretKey] = React.useState("");
  const [encrypt, setEncrypt] = React.useState(false);
  const [schedule, setSchedule] = React.useState<"disabled" | "daily" | "weekly">("daily");

  const fetchGitHubStatus = React.useCallback(async () => {
    try {
      setGithubLoading(true);
      const res = await fetch("/api/integrations/github/status");
      if (res.ok) {
        const data = await res.json();
        setGithubConn(data);
        if (data.repos?.length) {
          setGithubRepos(data.repos.join(", "));
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setGithubLoading(false);
    }
  }, []);

  const fetchBackupData = React.useCallback(async () => {
    try {
      setBackupLoading(true);
      const [configRes, listRes] = await Promise.all([
        fetch("/api/integrations/backup/config"),
        fetch("/api/integrations/backup/list"),
      ]);

      if (configRes.ok) {
        const { config } = await configRes.json();
        setBackupConfig(config);
        setProvider(config.provider || "local");
        setLocalPath(config.localPath || "./backups");
        setEncrypt(Boolean(config.encrypt));
        setSchedule(config.schedule || "daily");
        if (config.s3Config) {
          setS3Bucket(config.s3Config.bucket || "");
          setS3Region(config.s3Config.region || "us-east-1");
          setS3Endpoint(config.s3Config.endpoint || "");
          setS3AccessKey(config.s3Config.accessKeyId || "");
          setS3SecretKey(config.s3Config.secretAccessKey || "");
        }
      }

      if (listRes.ok) {
        const { backups } = await listRes.json();
        setBackups(backups || []);
      }
    } catch {
      // Non-fatal
    } finally {
      setBackupLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchGitHubStatus();
    fetchBackupData();
  }, [fetchGitHubStatus, fetchBackupData]);

  // Connect GitHub
  const handleConnectGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubToken.trim()) {
      toast.error("Please enter a GitHub personal access token");
      return;
    }

    try {
      setConnectingGithub(true);
      const reposArray = githubRepos
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);

      const res = await fetch("/api/integrations/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: githubToken.trim(),
          repos: reposArray,
          webhookSecret: githubWebhookSecret.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to connect GitHub");
      }

      const data = await res.json();
      setGithubConn(data.connection);
      setGithubToken("");
      toast.success(`Connected to GitHub as @${data.connection.username}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to connect to GitHub");
    } finally {
      setConnectingGithub(false);
    }
  };

  // Disconnect GitHub
  const handleDisconnectGitHub = async () => {
    try {
      const res = await fetch("/api/integrations/github/disconnect", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      setGithubConn(null);
      toast.success("Disconnected GitHub integration");
    } catch (err: any) {
      toast.error(err.message || "Error disconnecting GitHub");
    }
  };

  // Sync GitHub
  const handleSyncGitHub = async () => {
    try {
      setSyncingGithub(true);
      const res = await fetch("/api/integrations/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to sync");
      }
      const data = await res.json();
      toast.success(`Sync complete: ${data.itemsCreated} new activities ingested`);
      await fetchGitHubStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync GitHub");
    } finally {
      setSyncingGithub(false);
    }
  };

  // Save Backup Config
  const handleSaveBackupConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingBackupConfig(true);
      const payload: any = {
        provider,
        localPath: provider === "local" ? localPath : undefined,
        encrypt,
        schedule,
      };

      if (provider === "s3") {
        if (!s3Bucket || !s3AccessKey || !s3SecretKey) {
          throw new Error("S3 requires bucket, access key ID, and secret access key");
        }
        payload.s3Config = {
          bucket: s3Bucket.trim(),
          region: s3Region.trim(),
          endpoint: s3Endpoint.trim() || undefined,
          accessKeyId: s3AccessKey.trim(),
          secretAccessKey: s3SecretKey.trim(),
        };
      }

      const res = await fetch("/api/integrations/backup/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save backup config");
      }

      const data = await res.json();
      setBackupConfig(data.config);
      toast.success("Backup storage configuration saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save backup configuration");
    } finally {
      setSavingBackupConfig(false);
    }
  };

  // Trigger Manual Backup
  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      const res = await fetch("/api/integrations/backup/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create backup");
      }

      const data = await res.json();
      toast.success(`Backup created: ${Math.round(data.backup.sizeBytes / 1024)} KB`);
      await fetchBackupData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create backup");
    } finally {
      setCreatingBackup(false);
    }
  };

  // Verify Backup
  const handleVerifyBackup = async (id: string) => {
    try {
      setVerifyingId(id);
      const res = await fetch(`/api/integrations/backup/verify/${id}`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to verify backup");
      }

      const result = await res.json();
      if (result.valid && result.checksumMatches) {
        toast.success("Backup integrity verified: SHA-256 checksum matched!");
        setBackups((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: "verified" } : b))
        );
      } else {
        toast.error(`Verification failed: ${result.errors?.join(", ") || "Unknown issue"}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Error verifying backup archive");
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="integrations-settings-view">
      {/* 1. GitHub Activity Ingestion (INTEG-02) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github className="h-5 w-5 text-foreground" />
              <CardTitle className="text-base">GitHub Activity Integration</CardTitle>
            </div>
            {githubConn?.connected ? (
              <Badge variant="default" className="bg-emerald-600 text-white gap-1">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Disconnected
              </Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            Ingest your GitHub commits, pull requests, and issues into your daily productivity timeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {githubConn?.connected ? (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">@{githubConn.username}</p>
                  <p className="text-xs text-muted-foreground">
                    Last synced: {githubConn.lastSyncAt ? new Date(githubConn.lastSyncAt).toLocaleString() : "Never"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncGitHub}
                    disabled={syncingGithub}
                    className="gap-1.5 text-xs h-8"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingGithub ? "animate-spin" : ""}`} />
                    {syncingGithub ? "Syncing..." : "Sync Now"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDisconnectGitHub}
                    className="text-xs h-8"
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConnectGitHub} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Personal Access Token (classic or fine-grained)
                </label>
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Requires <code>repo</code> or read access to activity. Tokens are encrypted at rest with AES-256-GCM.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Default Repositories (optional, comma-separated)
                </label>
                <Input
                  type="text"
                  placeholder="owner/repo1, owner/repo2"
                  value={githubRepos}
                  onChange={(e) => setGithubRepos(e.target.value)}
                  className="text-xs"
                />
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={connectingGithub}
                className="gap-1.5 text-xs"
              >
                {connectingGithub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Connect GitHub
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* 2. Automated Cloud Backup Adapter (INTEG-03, SEC-04) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Automated Cloud Backup</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleCreateBackup}
                disabled={creatingBackup}
                className="gap-1.5 text-xs h-8 bg-primary"
              >
                <Download className={`h-3.5 w-3.5 ${creatingBackup ? "animate-spin" : ""}`} />
                {creatingBackup ? "Backing up..." : "Backup Now"}
              </Button>
            </div>
          </div>
          <CardDescription className="text-xs">
            Export database and markdown notes to local storage or S3-compatible cloud storage with integrity checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSaveBackupConfig} className="space-y-3 border-b pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Storage Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as StorageProvider)}
                  className="w-full text-xs rounded-md border bg-background px-3 py-1.5"
                >
                  <option value="local">Local Filesystem</option>
                  <option value="s3">S3-Compatible Cloud Storage (AWS, R2, MinIO)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Automated Schedule
                </label>
                <select
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value as any)}
                  className="w-full text-xs rounded-md border bg-background px-3 py-1.5"
                >
                  <option value="daily">Daily at 02:00</option>
                  <option value="weekly">Weekly (Sundays)</option>
                  <option value="disabled">Disabled (Manual Only)</option>
                </select>
              </div>
            </div>

            {provider === "local" ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Local Backup Path
                </label>
                <Input
                  type="text"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">
                      Bucket Name
                    </label>
                    <Input
                      type="text"
                      placeholder="my-lifeos-backups"
                      value={s3Bucket}
                      onChange={(e) => setS3Bucket(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">
                      Region
                    </label>
                    <Input
                      type="text"
                      placeholder="us-east-1"
                      value={s3Region}
                      onChange={(e) => setS3Region(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">
                    Custom Endpoint (optional, for Cloudflare R2 / MinIO)
                  </label>
                  <Input
                    type="text"
                    placeholder="https://<account-id>.r2.cloudflarestorage.com"
                    value={s3Endpoint}
                    onChange={(e) => setS3Endpoint(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">
                      Access Key ID
                    </label>
                    <Input
                      type="text"
                      value={s3AccessKey}
                      onChange={(e) => setS3AccessKey(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">
                      Secret Access Key
                    </label>
                    <Input
                      type="password"
                      value={s3SecretKey}
                      onChange={(e) => setS3SecretKey(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={encrypt}
                  onChange={(e) => setEncrypt(e.target.checked)}
                  className="rounded border"
                />
                <span className="flex items-center gap-1 font-medium">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Encrypt backup archives at rest (AES-256-GCM)
                </span>
              </label>

              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={savingBackupConfig}
                className="text-xs h-8"
              >
                {savingBackupConfig ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>

          {/* Backup History Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Backup Archives ({backups.length})
            </h4>

            {backups.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                No backup archives created yet. Click &quot;Backup Now&quot; to export your database and notes.
              </p>
            ) : (
              <div className="divide-y rounded-md border text-xs">
                {backups.slice(0, 5).map((b) => (
                  <div key={b.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate max-w-[200px]">
                          {b.id}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {b.storageProvider}
                        </Badge>
                        {b.encrypted && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5">
                            <Lock className="h-2.5 w-2.5" /> Encrypted
                          </Badge>
                        )}
                        <Badge
                          variant={b.status === "verified" ? "default" : "outline"}
                          className={`text-[10px] ${
                            b.status === "verified"
                              ? "bg-emerald-600 text-white"
                              : ""
                          }`}
                        >
                          {b.status}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(b.startedAt).toLocaleString()} • {Math.round(b.sizeBytes / 1024)} KB • SHA-256:{" "}
                        <span className="font-mono">{b.checksum.slice(0, 10)}...</span>
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVerifyBackup(b.id)}
                      disabled={verifyingId === b.id}
                      className="gap-1 text-xs shrink-0 h-7 px-2"
                      title="Verify SHA-256 integrity and restore viability (SEC-04)"
                    >
                      {verifyingId === b.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3 w-3 text-emerald-500" />
                      )}
                      <span>Verify</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
