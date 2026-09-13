"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "@/lib/auth-client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const isSubmittingRef = React.useRef(false);

  // Redirect if already authenticated
  React.useEffect(() => {
    if (!sessionLoading && session?.user) {
      router.replace("/dashboard");
    }
  }, [session, sessionLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (isSubmittingRef.current) return;
    if (!email.trim() || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const res = await signIn.email({
        email: email.trim(),
        password,
      });

      if (res.error) {
        const message = res.error.message || "Invalid email or password.";
        setErrorMsg(message);
        toast.error(message);
      } else {
        toast.success("Welcome back!");
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      const message = err?.message || "Failed to sign in. Please check your credentials.";
      setErrorMsg(message);
      toast.error(message);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md shadow-xl" data-testid="login-card">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black text-xl shadow">
            L
          </div>
          <CardTitle className="text-2xl font-bold">Sign In to LifeOS</CardTitle>
          <CardDescription>
            Enter your credentials to access your personal operating system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                data-testid="auth-error"
                className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Email address
              </label>
              <Input
                id="email"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
                data-testid="login-email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </label>
              </div>
              <Input
                id="password"
                type="password"
                name="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
                data-testid="login-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              loading={loading}
              data-testid="login-submit"
            >
              Sign In
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t p-4 text-xs text-muted-foreground">
          <span>First time setting up? </span>
          <Link
            href="/register"
            className="ml-1 font-semibold text-primary underline-offset-4 hover:underline"
            data-testid="register-link"
          >
            Create your account
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
