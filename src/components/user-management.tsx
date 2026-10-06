"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  type ManagedUser,
  type ManagedUserType,
  USER_TYPES,
  type UserSyncResult,
} from "@/lib/hik/user-types";

type UserForm = {
  employeeNo: string;
  name: string;
  cardNo: string;
  userType: ManagedUserType;
  validFrom: string;
  validUntil: string;
};

const EMPTY_FORM: UserForm = {
  employeeNo: "",
  name: "",
  cardNo: "",
  userType: "normal",
  validFrom: "",
  validUntil: "",
};

function toForm(user: ManagedUser): UserForm {
  return {
    employeeNo: user.employeeNo,
    name: user.name,
    cardNo: user.cardNo,
    userType: user.userType,
    validFrom: user.validFrom ?? "",
    validUntil: user.validUntil ?? "",
  };
}

function readableType(value: string): string {
  if (value === "blackList") {
    return "Blocked";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No expiry";
  }
  return new Date(value).toLocaleDateString();
}

function syncSummary(results: UserSyncResult[]): string {
  if (results.length === 0) {
    return "Saved in the master database. No devices are configured to sync.";
  }
  const failed = results.filter((result) => !result.ok);
  return failed.length === 0
    ? `Synchronized to ${results.length} device${results.length === 1 ? "" : "s"}.`
    : `Saved in the master database; ${failed.length} of ${results.length} device sync${results.length === 1 ? "" : "s"} failed. Review sync activity below.`;
}

export function UserManagement({
  initialUsers,
}: {
  initialUsers: ManagedUser[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editingUser = users.find((user) => user.id === editingId) ?? null;
  const currentPhoto = photoPreview ?? editingUser?.photoUrl ?? null;

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photoFile]);

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return users;
    }
    return users.filter(
      (user) =>
        user.employeeNo.toLowerCase().includes(needle) ||
        user.name.toLowerCase().includes(needle) ||
        user.cardNo.toLowerCase().includes(needle),
    );
  }, [query, users]);

  const updateForm = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const reload = async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not refresh users and sync activity.");
    }
    const payload = (await response.json()) as { users: ManagedUser[] };
    setUsers(payload.users);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    let savedUser: ManagedUser | null = null;
    try {
      const response = await fetch(
        editingId ? `/api/users/${editingId}` : "/api/users",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            validFrom: form.validFrom || null,
            validUntil: form.validUntil || null,
          }),
        },
      );
      const payload = (await response.json()) as {
        user?: ManagedUser;
        results?: UserSyncResult[];
        error?: string;
      };
      if (!response.ok || !payload.user) {
        setError(payload.error ?? "Could not save the user.");
        return;
      }
      savedUser = payload.user;
      let message = syncSummary(payload.results ?? []);
      if (photoFile) {
        const photoResponse = await fetch(
          `/api/users/${payload.user.id}/photo`,
          {
            method: "POST",
            headers: { "Content-Type": photoFile.type },
            body: photoFile,
          },
        );
        const photoPayload = (await photoResponse.json()) as {
          sizeBytes?: number;
          results?: UserSyncResult[];
          error?: string;
        };
        if (!photoResponse.ok || photoPayload.sizeBytes === undefined) {
          setForm(toForm(savedUser));
          setEditingId(savedUser.id);
          setError(
            `User saved, but the photo was not uploaded: ${photoPayload.error ?? "Photo upload failed."}`,
          );
          await reload();
          return;
        }
        message = `Photo optimized to ${(photoPayload.sizeBytes / 1024).toFixed(1)} KB. ${syncSummary(photoPayload.results ?? [])}`;
      }
      setFeedback(message);
      setForm(EMPTY_FORM);
      setEditingId(null);
      setPhotoFile(null);
      await reload();
    } catch (failure) {
      if (savedUser && photoFile) {
        setForm(toForm(savedUser));
        setEditingId(savedUser.id);
        setError(
          `User saved, but the photo upload could not be confirmed. Retry the photo from this form. ${
            failure instanceof Error ? failure.message : ""
          }`,
        );
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not reach the app server.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (user: ManagedUser) => {
    if (
      !window.confirm(
        `Delete ${user.name} (${user.employeeNo}) from the master database and all configured devices?`,
      )
    ) {
      return;
    }
    setBusyUserId(user.id);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        deleted?: boolean;
        results?: UserSyncResult[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not delete the user.");
      }
      setFeedback(
        payload.deleted
          ? `Removed from the master database. ${syncSummary(payload.results ?? [])}`
          : `Master record retained because at least one device did not confirm deletion. ${syncSummary(payload.results ?? [])} Retry after resolving the device issue.`,
      );
      if (payload.deleted && editingId === user.id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setPhotoFile(null);
      }
      await reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not reach the app server.",
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const retry = async (user: ManagedUser) => {
    setBusyUserId(user.id);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/users/${user.id}/sync`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        results?: UserSyncResult[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not retry device sync.");
      }
      setFeedback(syncSummary(payload.results ?? []));
      await reload();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not reach the app server.",
      );
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">People</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            The database is the source of truth. Identity and card changes are
            pushed to every configured terminal.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {users.length} master records
          </span>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Employee number</span>
          <input
            required
            maxLength={32}
            value={form.employeeNo}
            disabled={Boolean(editingId)}
            onChange={(event) => updateForm("employeeNo", event.target.value)}
            placeholder="EMP-001"
            autoComplete="off"
            className="rounded-md border border-zinc-300 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 disabled:opacity-60 dark:border-zinc-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Full name</span>
          <input
            required
            maxLength={64}
            value={form.name}
            onChange={(event) => updateForm("name", event.target.value)}
            placeholder="Name on access terminal"
            className="rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
          {currentPhoto ? (
            <Image
              src={currentPhoto}
              alt="User face preview"
              width={64}
              height={64}
              unoptimized
              className="size-16 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
            />
          ) : (
            <div className="grid size-16 place-items-center rounded-lg bg-zinc-100 font-mono text-xs text-zinc-500 dark:bg-zinc-800">
              PHOTO
            </div>
          )}
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">
              Face photo{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(event) => {
                setPhotoFile(event.target.files?.[0] ?? null);
              }}
              className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-800 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              JPEG, PNG, WebP or AVIF, up to 10 MB. The server converts it to a
              JPEG under 200 KB before storing and syncing. Face enrollment
              requires a card number and a face library on each terminal.
            </span>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Card number (optional)</span>
          <input
            maxLength={32}
            value={form.cardNo}
            onChange={(event) => updateForm("cardNo", event.target.value)}
            placeholder="Card identifier"
            autoComplete="off"
            className="rounded-md border border-zinc-300 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">User type</span>
          <select
            value={form.userType}
            onChange={(event) =>
              updateForm("userType", event.target.value as ManagedUserType)
            }
            className="rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
          >
            {USER_TYPES.map((type) => (
              <option key={type} value={type}>
                {readableType(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Valid from (device local time)</span>
          <input
            type="datetime-local"
            value={form.validFrom}
            onChange={(event) => updateForm("validFrom", event.target.value)}
            className="rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Valid until (optional)</span>
          <input
            type="datetime-local"
            value={form.validUntil}
            onChange={(event) => updateForm("validUntil", event.target.value)}
            className="rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
          >
            {busy
              ? "Saving and syncing..."
              : editingId
                ? "Save changes"
                : "Add person"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setError(null);
                setFeedback(null);
              }}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {error || feedback ? (
        <p
          role={error ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-sm ${
            error
              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
          }`}
        >
          {error ?? feedback}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold">Master directory</h3>
          <label className="sr-only" htmlFor="user-search">
            Search users
          </label>
          <input
            id="user-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, employee or card"
            className="w-full max-w-xs rounded-md border border-zinc-300 bg-background px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
            <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-4 py-2.5">
                  Person
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Employee no.
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Card
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Type / validity
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {user.photoUrl ? (
                        <Image
                          src={user.photoUrl}
                          alt=""
                          width={36}
                          height={36}
                          unoptimized
                          className="size-9 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="grid size-9 place-items-center rounded-lg bg-zinc-100 font-mono text-[9px] text-zinc-500 dark:bg-zinc-800">
                          —
                        </span>
                      )}
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {user.employeeNo}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {user.cardNo || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block">{readableType(user.userType)}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {user.validFrom
                        ? `From ${formatDate(user.validFrom)} · `
                        : ""}
                      Until {formatDate(user.validUntil)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyUserId === user.id || busy}
                        onClick={() => void retry(user)}
                        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        {busyUserId === user.id ? "Syncing..." : "Sync"}
                      </button>
                      <button
                        type="button"
                        disabled={busyUserId === user.id || busy}
                        onClick={() => {
                          setForm(toForm(user));
                          setEditingId(user.id);
                          setPhotoFile(null);
                          setError(null);
                          setFeedback(null);
                        }}
                        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyUserId === user.id || busy}
                        onClick={() => void remove(user)}
                        className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    {users.length === 0
                      ? "No people yet. Add a master record above."
                      : "No users match this search."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
