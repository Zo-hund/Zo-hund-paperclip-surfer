import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderOrgChartPng } from "../routes/org-chart-svg.js";

describe("org chart PNG export with the patched image library", () => {
  it("renders an organization with escaped names into a decodable PNG", async () => {
    const buffer = await renderOrgChartPng([
      { id: "root", name: 'R&D <Board> "Team"', role: "ceo", status: "idle", reports: [] },
    ]);
    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
    await expect(sharp(buffer).raw().toBuffer()).resolves.toBeInstanceOf(Buffer);
  });
});
