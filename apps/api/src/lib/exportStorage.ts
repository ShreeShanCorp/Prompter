import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ExportStorage {
  save(key: string, content: string | Buffer): Promise<{ url: string }>;
  /** Reads back content previously saved, given the `url` returned by save(). */
  readByUrl(url: string): Promise<Buffer>;
}

/**
 * Local-filesystem storage, used until the Stage D Cloudflare R2 integration
 * lands (Section 7 of SaaS-Build-Prompt-Template.md). Callers depend only on
 * the ExportStorage interface, so swapping in an R2-backed implementation
 * later requires no changes to the export route. Files live on the API
 * server's own disk, so the frontend can't fetch the `file://` url directly
 * -- it must go through the /download route, which calls readByUrl().
 */
export class LocalExportStorage implements ExportStorage {
  constructor(private readonly baseDir: string) {}

  async save(key: string, content: string | Buffer): Promise<{ url: string }> {
    const filePath = path.join(this.baseDir, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return { url: `file://${filePath}` };
  }

  async readByUrl(url: string): Promise<Buffer> {
    if (!url.startsWith("file://")) {
      throw new Error(`LocalExportStorage cannot read non-local url: ${url}`);
    }
    return readFile(url.slice("file://".length));
  }
}

export const defaultExportStorage: ExportStorage = new LocalExportStorage(
  path.resolve(process.cwd(), ".local-exports"),
);
