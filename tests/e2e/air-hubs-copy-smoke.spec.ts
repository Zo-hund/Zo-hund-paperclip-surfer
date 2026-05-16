import { expect, test } from "@playwright/test";

type RouteCheck = {
  path: string;
  expected: string[];
};

const routes: RouteCheck[] = [
  {
    path: "/profile",
    expected: ["Community", "Collectives", "Electives", "Member Central"],
  },
  {
    path: "/lms/dashboard",
    expected: ["TECH AT NITE", "Community", "Collectives", "Electives"],
  },
  {
    path: "/xp/exchange",
    expected: ["AMX Skills Marketplace", "Collectives", "Electives", "Community"],
  },
  {
    path: "/marketplace",
    expected: ["AMX Skills Marketplace", "Collectives", "Electives", "Community"],
  },
];

test.describe("Air Hubs copy smoke", () => {
  for (const route of routes) {
    test(`${route.path} renders Air Hubs language without console errors`, async ({ page, baseURL }) => {
      const consoleMessages: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          consoleMessages.push(message.text());
        }
      });

      await page.goto(`${baseURL}${route.path}`);
      await page.waitForLoadState("networkidle");

      for (const snippet of route.expected) {
        await expect(page.getByText(snippet, { exact: false }).first()).toBeVisible();
      }

      expect(consoleMessages).toEqual([]);
    });
  }
});
