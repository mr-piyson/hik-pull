"use client";

import { LoaderCircle, TriangleAlert, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout, PasswordInput } from "@/components/auth-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUp, useSession } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";

export default function SignUpPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [name, setName] = useState("");
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
    if (hasUsers) {
      router.replace("/sign-in");
    }
  }, [session, isPending, hasUsers, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signUp.email({
        email,
        password,
        name,
        callbackURL: "/",
      });
      router.push("/");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Failed to sign up",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create the first account"
      description="This workspace has no accounts yet. The first user becomes the administrator."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="Your name"
              autoComplete="name"
              className="h-9"
            />
          </Field>
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
              placeholder="Create a password"
              autoComplete="new-password"
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
            <UserRoundPlus data-icon="inline-start" aria-hidden="true" />
          )}
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
