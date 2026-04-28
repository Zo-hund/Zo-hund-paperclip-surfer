import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { BriefcaseDeliverable } from "./work-products.js";

function getOpprcInfo(type?: string): { folder: string; ext: string } {
  const t = (type ?? "").toLowerCase();
  if (["document", "text"].includes(t)) return { folder: "01-TEXT", ext: "md" };
  if (["image", "artifact", "visual"].includes(t)) return { folder: "02-IMAGE", ext: "png" };
  if (["video", "preview_url"].includes(t)) return { folder: "03-VIDEO", ext: "mp4" };
  if (["code", "pull_request", "branch", "commit"].includes(t)) return { folder: "04-CODE", ext: "ts" };
  if (["runtime_service", "audit"].includes(t)) return { folder: "05-SKILLS", ext: "md" };
  return { folder: "MASTERS-BRIEFCASE", ext: "md" };
}

function slugifyTitle(title?: string | null): string {
  return (title ?? "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * intelligently downloads/saves a deliverable to the configured AMX_AGENT_WORK_FOLDER
 * without blocking the main event thread, using streaming for urls.
 */
export async function autoDownloadDeliverable(dl: BriefcaseDeliverable): Promise<void> {
  try {
    const rootDir = process.env.AMX_AGENT_WORK_FOLDER?.trim();
    if (!rootDir) return; // Feature disabled natively if AMX_AGENT_WORK_FOLDER isn't set

    if (dl.reviewState !== "approved") return; // Only process approved assets

    const { folder, ext } = getOpprcInfo(dl.type);
    const slug = dl.issueIdentifier
      ? `${dl.issueIdentifier.toLowerCase()}_${slugifyTitle(dl.title)}`
      : slugifyTitle(dl.title);
    
    // We append the ID so we don't accidentally overwrite different versions aggressively, or just stick to standard
    const filename = `${slug}_${dl.id.slice(0, 5)}.${ext}`;
    
    const targetDir = path.resolve(rootDir, folder);
    await fs.mkdir(targetDir, { recursive: true });

    const targetFile = path.resolve(targetDir, filename);

    // Intelligent check: if we already downloaded this exact ID+slug, skip
    try {
      await fs.access(targetFile);
      return; // Already downloaded
    } catch {
      // File doesn't exist, proceed
    }

    if (dl.url) {
      // Fetch URL and stream it into the target folder
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
      
      const response = await fetch(dl.url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch url: ${response.statusText}`);
      }
      
      if (response.body) {
        // We use Node's native stream capabilities combined with fetch web streams
        // Converting web readable stream to node readable stream
        const fileStream = createWriteStream(targetFile);
        // @ts-ignore
        const readable = Readable.fromWeb(response.body);
        await finished(readable.pipe(fileStream));
      }
    } else if (dl.summary) {
      // If no url, use the text summary
      await fs.writeFile(targetFile, dl.summary, "utf-8");
    }
  } catch (error) {
    console.error("[auto-download] Failed to download deliverable to local folder:", error);
  }
}
