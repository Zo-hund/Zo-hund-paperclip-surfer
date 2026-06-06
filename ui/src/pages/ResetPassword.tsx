import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { Button } from "@/components/ui/button";
import { AsciiArtAnimation } from "@/components/AsciiArtAnimation";
import { ArrowLeft, CheckCircle } from "lucide-react";

function PasswordStrengthBar({ password }: { password: string }) {
  const score = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  const label = ["", "Weak", "Fair", "Good", "Strong", "Very strong"][score] ?? "";
  const color = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-green-500", "bg-emerald-500"][score] ?? "";

  if (!password) return null;

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= score ? color : "bg-border"}`}
          />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  // Auto-redirect to sign-in 3 s after success
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => navigate("/auth", { replace: true }), 3000);
    return () => clearTimeout(t);
  }, [done, navigate]);

  const mutation = useMutation({
    mutationFn: () => authApi.resetPassword(token, password),
    onSuccess: () => setDone(true),
  });

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;
  const canSubmit = token && password.length >= 8 && password === confirm && !mutation.isPending;

  return (
    <div className="public-page flex min-h-screen bg-background">
      {/* Left — form */}
      <div className="w-full md:w-1/2 flex flex-col">
        <div className="w-full max-w-md mx-auto my-auto px-8 py-12">
          {/* Brand */}
          <div className="flex items-center gap-2 mb-8 scale-110 origin-left">
            <img
              src="/brand-logo.png"
              alt="AMX LABS Logo"
              className="w-6 h-6 object-contain animate-[spin_30s_linear_infinite] hover:drop-shadow-[0_0_16px_var(--primary)] hover:scale-110 transition-all duration-300"
            />
            <span className="text-[12px] font-black tracking-widest uppercase text-foreground/90 leading-none">
              AMX LABS x AMX-AIR-HUBS
            </span>
          </div>

          {!token ? (
            /* ── Missing token ── */
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Invalid reset link</h1>
              <p className="text-sm text-muted-foreground">
                This reset link is missing or malformed. Please request a new one.
              </p>
              <Link
                to="/forgot-password"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Request a new link
              </Link>
            </div>
          ) : done ? (
            /* ── Success state ── */
            <div className="space-y-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <h1 className="text-xl font-semibold">Password updated!</h1>
              <p className="text-sm text-muted-foreground">
                Your password has been reset. Redirecting you to sign in…
              </p>
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-2"
              >
                Sign in now
              </Link>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <h1 className="text-xl font-semibold">Choose a new password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick something strong — at least 8 characters.
              </p>

              <form
                id="reset-password-form"
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canSubmit) return;
                  mutation.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-password"
                    className="text-xs text-muted-foreground block"
                  >
                    New password
                  </label>
                  <input
                    id="reset-password"
                    type="password"
                    autoComplete="new-password"
                    autoFocus
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                  />
                  {tooShort && (
                    <p className="text-[11px] text-destructive">At least 8 characters required.</p>
                  )}
                  <PasswordStrengthBar password={password} />
                </div>

                <div>
                  <label
                    htmlFor="reset-confirm"
                    className="text-xs text-muted-foreground mb-1 block"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="reset-confirm"
                    type="password"
                    autoComplete="new-password"
                    className={`w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 ${
                      mismatch ? "border-destructive" : "border-border"
                    }`}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Same as above"
                  />
                  {mismatch && (
                    <p className="mt-1 text-[11px] text-destructive">Passwords don't match.</p>
                  )}
                </div>

                {mutation.isError && (
                  <p className="text-xs text-destructive">
                    {mutation.error instanceof Error
                      ? mutation.error.message
                      : "Reset failed. The link may have expired — request a new one."}
                  </p>
                )}

                {mutation.isError && (
                  <Link
                    to="/forgot-password"
                    className="text-xs underline underline-offset-2 text-muted-foreground"
                  >
                    Request a new reset link
                  </Link>
                )}

                <Button
                  id="reset-password-submit"
                  type="submit"
                  className="w-full"
                  disabled={!canSubmit}
                >
                  {mutation.isPending ? "Resetting…" : "Reset password"}
                </Button>
              </form>

              <div className="mt-5 text-sm text-muted-foreground">
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right — ASCII art */}
      <div className="hidden md:block w-1/2 overflow-hidden">
        <AsciiArtAnimation />
      </div>
    </div>
  );
}
