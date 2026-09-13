import type { Db } from "@paperclipai/db";
import { describe, expect, it, vi } from "vitest";
import { documentService } from "../services/documents.js";

describe("document conflict translation", () => {
  const write = (error: unknown) => documentService({
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ id: "synthetic-issue", companyId: "synthetic-company" }]) }) }),
    transaction: vi.fn().mockRejectedValue(error),
  } as unknown as Db).upsertIssueDocument({
    issueId: "synthetic-issue", key: "review", format: "markdown", body: "Synthetic content",
  });

  it.each([0, 1, 2])("translates a unique violation through %i query wrappers", async (depth) => {
    let error: unknown = Object.assign(new Error("Duplicate key"), { code: "23505" });
    for (let i = 0; i < depth; i++) error = new Error("Query failed", { cause: error });
    await expect(write(error)).rejects.toMatchObject({ status: 409 });
  });

  it("preserves a non-conflict database failure", async () => {
    const error = new Error("Connection lost", { cause: { code: "08006" } });
    await expect(write(error)).rejects.toBe(error);
  });

  it("does not loop on a cyclic error cause", async () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    await expect(write(error)).rejects.toBe(error);
  });
});
