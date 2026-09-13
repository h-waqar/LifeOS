"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp, useSession } from "@/lib/auth-client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertCircle, ShieldAlert } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isLocked, setIsLocked] = React.useState(false);
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
    setIsLocked(false);

    if (isSubmittingRef.current) return;
    if (!name.trim() || !email.trim() || !password) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const res = await signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      if (res.error) {
        const message = res.error.message || "Registration failed.";
        setErrorMsg(message);
        if (
          message.toLowerCase().includes("registration is closed") ||
          message.toLowerCase().includes("single-user") ||
          (res.error as any)?.status === 403
        ) {
          setIsLocked(true);
        }
        toast.error(message);
      } else {
        toast.success("Account created successfully! Welcome to LifeOS.");
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      const message = err?.message || "Registration failed. An unexpected error occurred.";
      setErrorMsg(message);
      if (
        message.toLowerCase().includes("registration is closed") ||
        message.toLowerCase().includes("single-user") ||
        err?.status === 403
      ) {
        setIsLocked(true);
      }
      toast.error(message);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md shadow-xl" data-testid="register-card">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black text-xl shadow">
            L
          </div>
          <CardTitle className="text-2xl font-bold">Initialize LifeOS</CardTitle>
          <CardDescription>
            Register the primary owner account for this LifeOS instance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                data-testid="auth-error"
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  isLocked
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                {isLocked ? (
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">
                    {isLocked ? "Registration Locked" : "Registration Error"}
                  </p>
                  <p className="text-xs mt-0.5">{errorMsg}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Full Name
              </label>
              <Input
                id="name"
                type="text"
                name="name"
                placeholder="Hamza Waqar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                disabled={loading}
                data-testid="register-name"
              />
            </div>

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
                placeholder="hamza@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={loading}
                data-testid="register-email"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Password (min 8 characters)
              </label>
              <Input
                id="password"
                type="password"
                name="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                disabled={loading}
                data-testid="register-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              loading={loading}
              data-testid="register-submit"
            >
              Create Account
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t p-4 text-xs text-muted-foreground">
          <span>Already have an account? </span>
          <Link
            href="/login"
            className="ml-1 font-semibold text-primary underline-offset-4 hover:underline"
            data-testid="login-link"
          >
            Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
