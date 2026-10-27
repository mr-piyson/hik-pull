"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean;
  createdAt?: string | Date;
};

export function AccountManagement() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.admin.listUsers({
        query: { limit: 100, offset: 0 },
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not load users.");
      }
      const payload = result.data;
      setUsers((payload?.users ?? []) as AuthUser[]);
      setTotal(payload?.total ?? 0);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not load users.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setFeedback(null);
    try {
      const createResult = await authClient.admin.createUser({
        email: newEmail,
        password: newPassword,
        name: newName,
        role: newRole as "user" | "admin",
      });
      if (createResult.error) {
        throw new Error(createResult.error.message ?? "Could not create user.");
      }
      setFeedback("User created.");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("user");
      setShowCreate(false);
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not create user.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleReset = async (userId: string) => {
    if (!resetPassword) return;
    setResetting(true);
    setError(null);
    setFeedback(null);
    try {
      const resetResult = await authClient.admin.setUserPassword({
        userId,
        newPassword: resetPassword,
      });
      if (resetResult.error) {
        throw new Error(
          resetResult.error.message ?? "Could not reset password.",
        );
      }
      setFeedback("Password updated.");
      setResettingId(null);
      setResetPassword("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not reset password.",
      );
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async (user: AuthUser) => {
    if (!window.confirm(`Delete ${user.name} (${user.email})?`)) return;
    setDeletingId(user.id);
    setError(null);
    setFeedback(null);
    try {
      const removeResult = await authClient.admin.removeUser({
        userId: user.id,
      });
      if (removeResult.error) {
        throw new Error(removeResult.error.message ?? "Could not delete user.");
      }
      setFeedback("User removed.");
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not delete user.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Administration
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Users
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Manage application accounts and reset passwords.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="h-7 px-3">
              {total} account{total === 1 ? "" : "s"}
            </Badge>
            <Button onClick={() => setShowCreate((value) => !value)}>
              {showCreate ? "Cancel" : "Add user"}
            </Button>
          </div>
        </div>

        {error || feedback ? (
          <Alert
            variant={error ? "destructive" : "default"}
            role={error ? "alert" : "status"}
          >
            <AlertDescription>{error ?? feedback}</AlertDescription>
          </Alert>
        ) : null}

        {showCreate ? (
          <Card>
            <CardHeader>
              <CardTitle>Create user</CardTitle>
              <CardDescription>Add a new application account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="flex flex-col gap-5">
                <FieldGroup className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="user-name">Name</FieldLabel>
                    <Input
                      id="user-name"
                      required
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="Full name"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="user-email">Email</FieldLabel>
                    <Input
                      id="user-email"
                      type="email"
                      required
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="user-password">Password</FieldLabel>
                    <Input
                      id="user-password"
                      type="password"
                      required
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Create a password"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="user-role">Role</FieldLabel>
                    <Select
                      value={newRole}
                      onValueChange={(value) => {
                        if (value) setNewRole(value);
                      }}
                    >
                      <SelectTrigger id="user-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating…" : "Create user"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>
              Search and manage application accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-medium">Name</th>
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b">
                        <td className="py-3 pr-4 font-medium">{user.name}</td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {user.email}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="secondary">
                            {user.role ?? "user"}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex justify-end gap-2">
                            {resettingId === user.id ? (
                              <>
                                <Input
                                  type="password"
                                  placeholder="New password"
                                  value={resetPassword}
                                  onChange={(event) =>
                                    setResetPassword(event.target.value)
                                  }
                                  className="max-w-48"
                                />
                                <Button
                                  size="sm"
                                  disabled={resetting || !resetPassword}
                                  onClick={() => void handleReset(user.id)}
                                >
                                  {resetting ? "Saving…" : "Save"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setResettingId(null);
                                    setResetPassword("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setResettingId(user.id)}
                                >
                                  Reset password
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={deletingId === user.id}
                                  onClick={() => void handleDelete(user)}
                                >
                                  {deletingId === user.id
                                    ? "Deleting…"
                                    : "Delete"}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No users yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
