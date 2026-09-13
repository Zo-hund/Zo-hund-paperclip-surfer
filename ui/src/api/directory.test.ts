import { afterEach, describe, expect, it, vi } from "vitest";
import { directoryApi } from "./directory";
describe("directory transport isolation", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("omits credentials and encodes public skill text", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ profiles: [], total: 0 })));
    vi.stubGlobal("fetch", fetch);
    await directoryApi.getPublicProfiles({ skill: "Docker & CI", limit: 50 });
    expect(fetch).toHaveBeenCalledWith("/api/public/directory/profiles?skill=Docker+%26+CI&limit=50", expect.objectContaining({ credentials: "omit" }));
  });
  it("uses the authenticated transport only for the instance directory", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ profiles: [], total: 0 })));
    vi.stubGlobal("fetch", fetch);
    await directoryApi.getInstanceProfiles();
    expect(fetch).toHaveBeenCalledWith("/api/instance/directory/profiles", expect.objectContaining({ credentials: "include" }));
  });
  it("retains HTTP failure status for permission and retry UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(directoryApi.getPublicProfiles()).rejects.toMatchObject({ status: 503 });
  });
  it("does not share an in-flight private response across account-keyed callers", async () => {
    let resolveFirst!: (value: Response) => void;
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profiles: [], total: 0 })));
    vi.stubGlobal("fetch", fetch);
    const previousAccount = directoryApi.getInstanceProfiles();
    const currentAccount = directoryApi.getInstanceProfiles();
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(currentAccount).resolves.toEqual({ profiles: [], total: 0 });
    resolveFirst(new Response(JSON.stringify({ profiles: [{ name: "Previous private profile" }], total: 1 })));
    await expect(previousAccount).resolves.toMatchObject({ total: 1 });
  });
});
