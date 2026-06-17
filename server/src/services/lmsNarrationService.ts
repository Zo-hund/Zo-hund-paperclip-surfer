import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { lmsModules, assets } from "@paperclipai/db";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

const NARRATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per module

const lastGenerated = new Map<string, number>();

export function lmsNarrationService(db: Db) {
  /**
   * Generate AI narration for a module using OpenAI TTS.
   * Caches the result as an asset and updates lmsModules.aiNarrationUrl.
   */
  async function generateNarration(
    companyId: string,
    moduleId: string,
  ): Promise<{ url: string } | { error: string }> {
    const last = lastGenerated.get(moduleId);
    if (last && Date.now() - last < NARRATION_COOLDOWN_MS) {
      return { error: "Narration generation rate limited — try again in a few minutes." };
    }

    const [module] = await db.select()
      .from(lmsModules)
      .where(eq(lmsModules.id, moduleId));

    if (!module) return { error: "Module not found." };
    if (!module.contentText?.trim()) return { error: "Module has no content text to narrate." };

    // Use OpenAI TTS if key is available, otherwise return placeholder
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      return { error: "OpenAI API key not configured. Set OPENAI_API_KEY to enable AI narration." };
    }

    lastGenerated.set(moduleId, Date.now());

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova",
        input: module.contentText.slice(0, 4096), // TTS limit
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { error: `TTS generation failed: ${err}` };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(audioBuffer).digest("hex");
    const objectKey = `lms/narrations/${companyId}/${moduleId}-${sha256.slice(0, 8)}.mp3`;

    // Store as asset (URL is the object key — served via existing asset route or S3)
    const [asset] = await db.insert(assets).values({
      companyId,
      provider: "system",
      objectKey,
      contentType: "audio/mpeg",
      sha256,
      byteSize: audioBuffer.length,
    }).returning();

    const narrationUrl = `/api/assets/${asset!.id}`;

    await db.update(lmsModules)
      .set({ aiNarrationUrl: narrationUrl, updatedAt: new Date() })
      .where(eq(lmsModules.id, moduleId));

    return { url: narrationUrl };
  }

  return { generateNarration };
}
