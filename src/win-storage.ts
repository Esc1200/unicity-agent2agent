/**
 * Windows-safe StorageProvider that avoids the atomic renameSync
 * pattern that fails on Windows when the file handle is held.
 *
 * Uses writeFileSync + readFileSync instead of open/write/close/rename.
 */

import * as fs from "fs";
import * as path from "path";

export class WinSafeStorageProvider {
  private dataDir: string;
  private network: string;
  private identity: any = null;
  private cache: Map<string, string> = new Map();

  constructor(config: { dataDir: string; network: string }) {
    this.dataDir = config.dataDir;
    this.network = config.network;
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  setIdentity(identity: any): void {
    this.identity = identity;
  }

  private filePath(key: string): string {
    // Prefix with network to avoid cross-network contamination
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.dataDir, `${this.network}_${safeKey}.json`);
  }

  async get(key: string): Promise<string | null> {
    // Check cache first
    if (this.cache.has(key)) return this.cache.get(key)!;

    const fp = this.filePath(key);
    try {
      const data = fs.readFileSync(fp, "utf-8");
      this.cache.set(key, data);
      return data;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
    const fp = this.filePath(key);
    try {
      // Use writeFileSync directly — no atomic rename
      fs.writeFileSync(fp, value, "utf-8");
    } catch (err) {
      // Best-effort: log but don't crash
      console.error(`[WinStorage] write failed for ${key}:`, err);
    }
  }

  async remove(key: string): Promise<void> {
    this.cache.delete(key);
    const fp = this.filePath(key);
    try {
      fs.unlinkSync(fp);
    } catch {
      // File might not exist
    }
  }

  async has(key: string): Promise<boolean> {
    if (this.cache.has(key)) return true;
    const fp = this.filePath(key);
    return fs.existsSync(fp);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    try {
      const files = fs.readdirSync(this.dataDir);
      for (const f of files) {
        if (f.startsWith(this.network + "_")) {
          fs.unlinkSync(path.join(this.dataDir, f));
        }
      }
    } catch {
      // ignore
    }
  }

  destroy(): void {
    this.cache.clear();
  }
}

/**
 * Create Windows-safe providers by wrapping the standard providers
 * with our custom storage.
 */
export function patchStorageForWindows(providers: any): any {
  // Only patch on Windows
  if (process.platform !== "win32") return providers;

  const storage = new WinSafeStorageProvider({
    dataDir: providers.storage?.dataDir || "./data/storage",
    network: providers.storage?.network || "testnet",
  });

  return {
    ...providers,
    storage,
  };
}
