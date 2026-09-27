// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSkillSelector } from "./AgentSkillSelector";
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [
  { id: "one", key: "paperclipai/paperclip/paperclip", name: "paperclip" },
  { id: "two", key: "paperclipai/paperclip/para-memory-files", name: "para-memory-files" },
] }) }));
vi.mock("../api/companySkills", () => ({ companySkillsApi: { list: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());
describe("AgentSkillSelector", () => {
  it("reads canonical keys, toggles once, saves keys and refreshes server selection", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container); const save = vi.fn();
    const render = (selectedSkills: string[]) => root.render(<AgentSkillSelector companyId="company" selectedSkills={selectedSkills} onSave={save} />);
    try {
      await act(async () => render(["paperclipai/paperclip/paperclip"]));
      const checkbox = () => container.querySelector('[role="checkbox"][aria-label="paperclip"]') as HTMLButtonElement;
      expect(checkbox().getAttribute("aria-checked")).toBe("true");
      await act(async () => checkbox().click());
      expect(checkbox().getAttribute("aria-checked")).toBe("false");
      await act(async () => (Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Save")!).click());
      expect(save).toHaveBeenLastCalledWith([]);
      await act(async () => render(["paperclipai/paperclip/para-memory-files"]));
      expect(container.querySelector('[aria-label="para-memory-files"]')!.getAttribute("aria-checked")).toBe("true");
      await act(async () => checkbox().click());
      await act(async () => (Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Save")!).click());
      expect(save).toHaveBeenLastCalledWith(["paperclipai/paperclip/para-memory-files", "paperclipai/paperclip/paperclip"]);
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});
