import fs from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "./adapter";

export class LocalStorageAdapter implements StorageAdapter {
  readonly provider = "local" as const;
  private readonly baseDir: string;

  constructor(baseDir = "./backups") {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  private resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.baseDir, relativePath);
    if (!resolved.startsWith(this.baseDir + path.sep) && resolved !== this.baseDir) {
      throw new Error("Security violation: Path traversal attempt outside backup directory");
    }
    return resolved;
  }

  async save(filePath: string, content: Buffer | string): Promise<string> {
    const fullPath = this.resolveSafePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return fullPath;
  }

  async read(filePath: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(filePath);
    return fs.readFile(fullPath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolveSafePath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix = ""): Promise<string[]> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      const entries = await fs.readdir(this.baseDir, { recursive: true, withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const entryPath = path.relative(
            this.baseDir,
            path.join((entry as any).parentPath || this.baseDir, entry.name)
          );
          if (!prefix || entryPath.startsWith(prefix)) {
            files.push(entryPath);
          }
        }
      }

      return files.sort();
    } catch {
      return [];
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      const fullPath = this.resolveSafePath(filePath);
      await fs.unlink(fullPath);
    } catch {
      // Ignored if file does not exist
    }
  }
}
