import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { authApi } from "../api/auth";
import { Button } from "@/components/ui/button";
import { AsciiArtAnimation } from "@/components/AsciiArtAnimation";
import { ArrowLeft, Mail } from "lucide-react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: () => authApi.forgotPassword(email.trim().toLowerCase()),
    onSuccess: () => setSent(true),
  });

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

          {sent ? (
            /* ── Success state ── */
            <div className="space-y-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-6">
                <Mail className="h-6 w-6 text-indigo-400" />
              </div>
              <h1 className="text-xl font-semibold">Check your email</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If an account exists for <strong className="text-foreground">{email}</strong>,
                we've sent a password reset link. It expires in{" "}
                <strong className="text-foreground">1 hour</strong>.
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Didn't receive anything? Check your spam folder, or{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 font-medium text-foreground"
                  onClick={() => {
                    setSent(false);
                    mutation.reset();
                  }}
                >
                  try again
                </button>
                .
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Still stuck? Contact your instance admin — they can reset your password
                directly from the Members settings page.
              </p>
              <div className="pt-4">
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <h1 className="text-xl font-semibold">Forgot your password?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the email address you used to sign up. We'll send you a link
                to reset your password.
              </p>

              <form
                id="forgot-password-form"
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (mutation.isPending || !email.trim()) return;
                  mutation.mutate();
                }}
              >
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="text-xs text-muted-foreground mb-1 block"
                  >
                    Email address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                {mutation.isError && (
                  <p className="text-xs text-destructive">
                    {mutation.error instanceof Error
                      ? mutation.error.message
                      : "Failed to send reset email. Try again."}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={mutation.isPending || !email.trim()}
                >
                  {mutation.isPending ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <div className="mt-5 text-sm text-muted-foreground">
                Remember your password?{" "}
                <Link
                  to="/auth"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Sign in
                </Link>
              </div>

              {/* Context box */}
              <div className="mt-8 rounded-md border border-border bg-muted/20 px-4 py-3 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Not receiving emails?</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Check your spam / junk folder</li>
                  <li>Make sure you're using the email you signed up with</li>
                  <li>
                    Contact your instance admin — they can reset your password
                    directly in <strong className="text-foreground">Company Settings → Members</strong>
                  </li>
                </ul>
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
