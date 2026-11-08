"use client";

import { ArrowRight, LoaderCircle, LogIn, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout, PasswordInput } from "@/components/auth-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn, useSession } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";

export default function SignInPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void trpc.system.bootstrap
      .query()
      .then((result) => setHasUsers(result.hasUsers))
      .catch(() => setHasUsers(true));
  }, []);

  useEffect(() => {
    if (isPending || hasUsers === null) return;
    if (session) {
      router.replace("/");
      return;
    }
    if (!hasUsers) {
      router.replace("/sign-up");
    }
  }, [session, isPending, hasUsers, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signIn.email({
        email,
        password,
        callbackURL: "/",
      });
      router.push("/");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Failed to sign in",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      description="Use the account an administrator created for you."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Need an account?{" "}
          <Link
            href="/sign-up"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="you@example.com"
              autoComplete="email"
              className="h-9"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your password"
              autoComplete="current-password"
              visible={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
            />
          </Field>
        </FieldGroup>

        {error ? (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" disabled={loading} className="h-9 w-full">
          {loading ? (
            <LoaderCircle
              data-icon="inline-start"
              aria-hidden="true"
              className="animate-spin"
            />
          ) : (
            <LogIn data-icon="inline-start" aria-hidden="true" />
          )}
          {loading ? "Signing in…" : "Sign in"}
          {loading ? null : (
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
