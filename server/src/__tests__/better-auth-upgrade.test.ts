import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

describe("patched authentication library", () => {
  it("creates a user, signs in, and rejects an invalid password", async () => {
    const auth = betterAuth({
      baseURL: "http://localhost:3100",
      secret: "upgrade-regression-test-secret-only-32-characters",
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailAndPassword: { enabled: true },
      advanced: { useSecureCookies: false },
    });
    const signup = await auth.api.signUpEmail({
      body: { name: "Upgrade Test", email: "upgrade@example.test", password: "test-password-only-123" },
    });
    expect(signup.user.email).toBe("upgrade@example.test");
    const signin = await auth.api.signInEmail({
      body: { email: "upgrade@example.test", password: "test-password-only-123" },
    });
    expect(signin.user.id).toBe(signup.user.id);
    expect(signin.token).toBeTruthy();
    await expect(auth.api.signInEmail({
      body: { email: "upgrade@example.test", password: "incorrect-password-123" },
    })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    await expect(auth.api.getSession({ headers: new Headers() })).resolves.toBeNull();
  });
});
