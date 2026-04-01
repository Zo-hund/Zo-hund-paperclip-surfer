import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

/**
 * AMX LABS Recordings Service
 * Manages persistence for meeting audio (WEBM/Opus)
 */

const RECORDINGS_BASE_PATH = path.resolve(resolvePaperclipInstanceRoot(), "data", "recordings");

export const recordingService = {
  /**
   * Save a meeting recording chunk or final file
   */
  async saveRecording(companyId: string, meetingId: string, buffer: Buffer): Promise<string> {
    const dir = path.join(RECORDINGS_BASE_PATH, companyId);
    await fs.mkdir(dir, { recursive: true });
    
    // For now we save as a single file per meeting
    // In a more complex setup we might append chunks
    const filePath = path.join(dir, `${meetingId}.webm`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  },

  /**
   * Get a read stream for a meeting recording
   */
  async getRecordingStream(companyId: string, meetingId: string) {
    const filePath = path.join(RECORDINGS_BASE_PATH, companyId, `${meetingId}.webm`);
    try {
      await fs.access(filePath);
      return createReadStream(filePath);
    } catch {
      return null;
    }
  },

  /**
   * Delete a recording
   */
  async deleteRecording(companyId: string, meetingId: string) {
    const filePath = path.join(RECORDINGS_BASE_PATH, companyId, `${meetingId}.webm`);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if doesn't exist
    }
  }
};
