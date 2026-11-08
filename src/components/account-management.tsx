"use client";

import {
  KeyRound,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserCog,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog, Modal } from "@/components/modal";
import { PageBody, PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";
import { formatDate } from "@/lib/format";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean;
  createdAt?: string | Date;
};

const PAGE_SIZE = 10;

export function AccountManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");

  const [resetUser, setResetUser] = useState<AuthUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<AuthUser | null>(null);
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return users;
    }
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle),
    );
  }, [query, users]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
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
      toast({
        title: "Account created",
        description: `${newName} can now sign in with ${newEmail}.`,
        tone: "success",
      });
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

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetUser || !resetPassword) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      const resetResult = await authClient.admin.setUserPassword({
        userId: resetUser.id,
        newPassword: resetPassword,
      });
      if (resetResult.error) {
        throw new Error(
          resetResult.error.message ?? "Could not reset password.",
        );
      }
      toast({
        title: "Password updated",
        description: `${resetUser.name} can sign in with the new password.`,
        tone: "success",
      });
      setResetUser(null);
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
    setDeletingId(user.id);
    setError(null);
    try {
      const removeResult = await authClient.admin.removeUser({
        userId: user.id,
      });
      if (removeResult.error) {
        throw new Error(removeResult.error.message ?? "Could not delete user.");
      }
      toast({
        title: "Account removed",
        description: `${user.name} no longer has access.`,
        tone: "success",
      });
      setPendingDelete(null);
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
    <PageBody>
      <PageHeader
        eyebrow="Administration"
        title="Application users"
        description="Accounts that can sign in to this workspace. Roles decide whether someone can manage users and settings."
        meta={
          <>
            <StatusPill tone="primary" icon={UserCog}>
              {total} account{total === 1 ? "" : "s"}
            </StatusPill>
            <StatusPill tone="neutral" icon={ShieldCheck}>
              {users.filter((user) => user.role === "admin").length} admin
            </StatusPill>
          </>
        }
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <UserRoundPlus data-icon="inline-start" aria-hidden="true" />
            Add user
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/8">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or email"
              aria-label="Search users"
              className="h-8 pl-8 text-[13px]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            ) : null}
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {filtered.length} shown
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/8">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-foreground/8">
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserCog aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {users.length === 0
                    ? "No accounts yet"
                    : "No matching accounts"}
                </EmptyTitle>
                <EmptyDescription>
                  {users.length === 0
                    ? "Create an account so operators can sign in."
                    : "Try a different name or email."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Account</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name || user.email} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">
                            {user.name || "Unnamed"}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        tone={user.role === "admin" ? "primary" : "neutral"}
                        className="capitalize"
                      >
                        {user.role ?? "user"}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {user.createdAt ? formatDate(user.createdAt) : "—"}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setResetUser(user);
                            setResetPassword("");
                          }}
                        >
                          <KeyRound
                            data-icon="inline-start"
                            aria-hidden="true"
                          />
                          Reset password
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${user.name}`}
                          title="Delete account"
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          disabled={deletingId === user.id}
                          onClick={() => setPendingDelete(user)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </p>
              <Pagination
                page={safePage}
                pageCount={pageCount}
                onPageChange={setPage}
              />
            </div>
          </div>
        )}
      </section>

      <Modal
        open={showCreate}
        onOpenChange={setShowCreate}
        title="Add application user"
        description="The account can sign in immediately with the password you set here."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" disabled={creating}>
              {creating ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : (
                <Plus data-icon="inline-start" aria-hidden="true" />
              )}
              {creating ? "Creating…" : "Create user"}
            </Button>
          </>
        }
      >
        <form
          id="create-user-form"
          onSubmit={handleCreate}
          className="flex flex-col gap-4"
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="new-user-name">Name</FieldLabel>
              <Input
                id="new-user-name"
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Full name"
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
              <Input
                id="new-user-email"
                type="email"
                required
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-password">Password</FieldLabel>
              <Input
                id="new-user-password"
                type="password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Create a password"
                autoComplete="new-password"
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="new-user-role">Role</FieldLabel>
              <Select
                value={newRole}
                onValueChange={(value) => {
                  if (value) {
                    setNewRole(value);
                  }
                }}
              >
                <SelectTrigger id="new-user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="user">
                      Operator — day-to-day access management
                    </SelectItem>
                    <SelectItem value="admin">
                      Administrator — full access, including users
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </form>
      </Modal>

      <Modal
        open={resetUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetUser(null);
            setResetPassword("");
          }
        }}
        title={`Reset password for ${resetUser?.name ?? "user"}`}
        description="The new password takes effect immediately. Existing sessions stay signed in."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetUser(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="reset-password-form"
              disabled={resetting || resetPassword.length === 0}
            >
              {resetting ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : (
                <KeyRound data-icon="inline-start" aria-hidden="true" />
              )}
              {resetting ? "Saving…" : "Update password"}
            </Button>
          </>
        }
      >
        <form
          id="reset-password-form"
          onSubmit={handleReset}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="reset-password">New password</FieldLabel>
            <Input
              id="reset-password"
              type="password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              placeholder="Enter a new password"
              autoComplete="new-password"
              required
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title={`Delete ${pendingDelete?.name ?? "user"}?`}
        description="The account is removed and can no longer sign in. This cannot be undone."
        confirmLabel="Delete account"
        tone="destructive"
        busy={deletingId === pendingDelete?.id}
        onConfirm={() => {
          if (pendingDelete) {
            void handleDelete(pendingDelete);
          }
        }}
      >
        <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
          <Avatar name={pendingDelete?.name ?? "?"} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {pendingDelete?.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {pendingDelete?.email}
            </p>
          </div>
        </div>
      </ConfirmDialog>
    </PageBody>
  );
}
