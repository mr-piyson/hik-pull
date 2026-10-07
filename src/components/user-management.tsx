"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { PublicDevice } from "@/lib/hik/types";
import {
  AUTHENTICATION_MODES,
  type AuthenticationMode,
  type AuthenticationType,
  GENDERS,
  type ManagedUser,
  type ManagedUserGender,
  type ManagedUserType,
  USER_TYPES,
  type UserSyncResult,
} from "@/lib/hik/user-types";
import { trpc } from "@/trpc/client";

type UserForm = {
  employeeNo: string;
  name: string;
  cardNos: { id: string; value: string }[];
  userType: ManagedUserType;
  floorNumber: string;
  roomNumber: string;
  gender: ManagedUserGender;
  longTermEffective: boolean;
  isAdministrator: boolean;
  visitTimes: string;
  authenticationType: AuthenticationType;
  authenticationMode: AuthenticationMode;
  validFrom: string;
  validUntil: string;
};

const EMPTY_FORM: UserForm = {
  employeeNo: "",
  name: "",
  cardNos: [{ id: "draft-0", value: "" }],
  userType: "normal",
  floorNumber: "0",
  roomNumber: "0",
  gender: "unknown",
  longTermEffective: false,
  isAdministrator: false,
  visitTimes: "0",
  authenticationType: "sameDevice",
  authenticationMode: "face",
  validFrom: "",
  validUntil: "",
};

const FINGER_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function toForm(user: ManagedUser): UserForm {
  return {
    employeeNo: user.employeeNo,
    name: user.name,
    cardNos:
      user.cardNos.length > 0
        ? user.cardNos.map((value, index) => ({ id: `saved-${index}`, value }))
        : [{ id: "draft-0", value: "" }],
    userType: user.userType,
    floorNumber: String(user.floorNumber),
    roomNumber: String(user.roomNumber),
    gender: user.gender,
    longTermEffective: user.longTermEffective,
    isAdministrator: user.isAdministrator,
    visitTimes: String(user.visitTimes),
    authenticationType: user.authenticationType,
    authenticationMode: user.authenticationMode,
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

function authenticationLabel(mode: AuthenticationMode): string {
  const label = mode
    .replace(/([A-Z])/g, " $1")
    .replace(/\bFp\b/g, "Fingerprint")
    .replace(/\bPw\b/g, "Password")
    .replace(/\bFace\b/g, "Face")
    .replace(/\bCard\b/g, "Card")
    .replace(/\bOr\b/g, "or")
    .replace(/\bAnd\b/g, "and")
    .trim();
  return label[0].toUpperCase() + label.slice(1);
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
  const [devices, setDevices] = useState<PublicDevice[]>([]);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fingerprintDeviceId, setFingerprintDeviceId] = useState("");
  const [fingerprintNo, setFingerprintNo] = useState("1");
  const [fingerprintBusy, setFingerprintBusy] = useState(false);
  const [fingerprintMessage, setFingerprintMessage] = useState<string | null>(
    null,
  );
  const [nextCardFieldId, setNextCardFieldId] = useState(1);
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

  useEffect(() => {
    let active = true;
    void trpc.devices.list
      .query()
      .then((payload) => {
        if (active) {
          setDevices(payload.devices);
          setFingerprintDeviceId(
            (current) => current || payload.devices[0]?.id || "",
          );
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load configured devices.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return users;
    }
    return users.filter(
      (user) =>
        user.employeeNo.toLowerCase().includes(needle) ||
        user.name.toLowerCase().includes(needle) ||
        user.cardNos.some((cardNo) => cardNo.toLowerCase().includes(needle)),
    );
  }, [query, users]);

  const updateForm = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const reload = async () => {
    const payload = await trpc.users.list.query();
    setUsers(payload.users);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    let savedUser: ManagedUser | null = null;
    try {
      const data = {
        ...form,
        cardNos: form.cardNos.map((card) => card.value.trim()).filter(Boolean),
        floorNumber: Number(form.floorNumber),
        roomNumber: Number(form.roomNumber),
        visitTimes: Number(form.visitTimes),
        validFrom: form.validFrom || null,
        validUntil: form.validUntil || null,
      };
      const payload = editingId
        ? await trpc.users.update.mutate({ id: editingId, data })
        : await trpc.users.create.mutate(data);
      savedUser = payload.user;
      let message = syncSummary(payload.results);
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

  const captureFingerprint = async () => {
    if (!editingId || !fingerprintDeviceId) {
      setFingerprintMessage("Save the person and choose a device first.");
      return;
    }
    setFingerprintBusy(true);
    setFingerprintMessage(
      "Waiting for the selected device sensor. Place the person's finger on its reader.",
    );
    try {
      const payload = await trpc.users.enrollFingerprint.mutate({
        id: editingId,
        deviceId: fingerprintDeviceId,
        fingerNo: Number(fingerprintNo),
      });
      setFingerprintMessage(
        `Fingerprint ${fingerprintNo} enrolled on ${payload.deviceLabel}. Repeat on each additional device if needed.`,
      );
    } catch (failure) {
      setFingerprintMessage(
        failure instanceof Error
          ? failure.message
          : "Fingerprint enrollment failed.",
      );
    } finally {
      setFingerprintBusy(false);
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
      const payload = await trpc.users.remove.mutate({ id: user.id });
      setFeedback(
        payload.deleted
          ? `Removed from the master database. ${syncSummary(payload.results)}`
          : `Master record retained because at least one device did not confirm deletion. ${syncSummary(payload.results)} ${payload.results
              ?.filter((result) => !result.ok)
              .map((result) => `${result.deviceLabel}: ${result.message}`)
              .join(" ")} Retry after resolving the device issue.`,
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
      const payload = await trpc.users.sync.mutate({ id: user.id });
      setFeedback(syncSummary(payload.results));
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
    <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="flex flex-col gap-4 ">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">People</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              The database is the source of truth. People are assigned to Door 1
              with plan template 1; authentication inherits each terminal&apos;s
              setting.
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
          className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50/80 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div>
              <h3 className="font-semibold">
                {editingId ? "Edit person" : "Add person"}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Person details, credentials, and authentication settings
              </p>
            </div>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              Synced to {devices.length} device{devices.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex flex-col gap-5 p-4 sm:p-6">
            <fieldset className="rounded-xl border border-zinc-200 p-4 sm:p-5 dark:border-zinc-800">
              <legend className="px-2 text-sm font-semibold">
                Basic Information
              </legend>
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">
                    Employee ID <span className="text-red-600">*</span>
                  </span>
                  <input
                    required
                    maxLength={32}
                    value={form.employeeNo}
                    disabled={Boolean(editingId)}
                    onChange={(event) =>
                      updateForm("employeeNo", event.target.value)
                    }
                    placeholder="5738"
                    autoComplete="off"
                    className="h-10 rounded-md border border-zinc-300 bg-background px-3 font-mono outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-zinc-700"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">
                    Name <span className="text-red-600">*</span>
                  </span>
                  <input
                    required
                    maxLength={64}
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    placeholder="Full name"
                    className="h-10 rounded-md border border-zinc-300 bg-background px-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">Floor No.</span>
                  <input
                    type="number"
                    min={0}
                    max={2147483647}
                    value={form.floorNumber}
                    onChange={(event) =>
                      updateForm("floorNumber", event.target.value)
                    }
                    className="h-10 rounded-md border border-zinc-300 bg-background px-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">Room No.</span>
                  <input
                    type="number"
                    min={0}
                    max={2147483647}
                    value={form.roomNumber}
                    onChange={(event) =>
                      updateForm("roomNumber", event.target.value)
                    }
                    className="h-10 rounded-md border border-zinc-300 bg-background px-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700"
                  />
                </label>
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="font-medium">Gender</legend>
                  <div className="flex h-10 flex-wrap items-center gap-4">
                    {GENDERS.map((gender) => (
                      <label
                        key={gender}
                        className="inline-flex items-center gap-2 capitalize"
                      >
                        <input
                          type="radio"
                          name="gender"
                          value={gender}
                          checked={form.gender === gender}
                          onChange={() => updateForm("gender", gender)}
                          className="accent-blue-600"
                        />
                        {gender}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="font-medium">Person Type</legend>
                  <div className="flex h-10 flex-wrap items-center gap-4">
                    {USER_TYPES.map((type) => (
                      <label
                        key={type}
                        className="inline-flex items-center gap-2"
                      >
                        <input
                          type="radio"
                          name="userType"
                          value={type}
                          checked={form.userType === type}
                          onChange={() => updateForm("userType", type)}
                          className="accent-blue-600"
                        />
                        {type === "normal"
                          ? "Normal User"
                          : type === "blackList"
                            ? "Blocklist User"
                            : "Visitor"}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                  <span>
                    <span className="block font-medium">
                      Long-Term Effective User
                    </span>
                    <span className="text-xs text-zinc-500">
                      Ignore the validity end date
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.longTermEffective}
                    onChange={(event) =>
                      updateForm("longTermEffective", event.target.checked)
                    }
                    className="size-4 accent-blue-600"
                  />
                </label>
                <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                  <span>
                    <span className="block font-medium">Administrator</span>
                    <span className="text-xs text-zinc-500">
                      Allow local device UI privileges
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.isAdministrator}
                    onChange={(event) =>
                      updateForm("isAdministrator", event.target.checked)
                    }
                    className="size-4 accent-blue-600"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">Visit Times</span>
                  <input
                    type="number"
                    min={0}
                    max={2147483647}
                    value={form.visitTimes}
                    onChange={(event) =>
                      updateForm("visitTimes", event.target.value)
                    }
                    className="h-10 rounded-md border border-zinc-300 bg-background px-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">Start Time (device local)</span>
                  <input
                    type="datetime-local"
                    max="2037-12-31T23:59"
                    disabled={form.longTermEffective}
                    value={form.validFrom}
                    onChange={(event) =>
                      updateForm("validFrom", event.target.value)
                    }
                    className="h-10 rounded-md border border-zinc-300 bg-background px-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">End Time (device local)</span>
                  <input
                    type="datetime-local"
                    max="2037-12-31T23:59"
                    disabled={form.longTermEffective}
                    value={form.validUntil}
                    onChange={(event) =>
                      updateForm("validUntil", event.target.value)
                    }
                    className="h-10 rounded-md border border-zinc-300 bg-background px-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-zinc-200 p-4 sm:p-5 dark:border-zinc-800">
              <legend className="px-2 text-sm font-semibold">
                Certificate Configuration
              </legend>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                  <div>
                    <h4 className="text-sm font-medium">Face</h4>
                    <p className="text-xs text-zinc-500">
                      JPEG, PNG, WebP or AVIF. Compressed below 200 KB before
                      enrollment.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {currentPhoto ? (
                      <Image
                        src={currentPhoto}
                        alt="User face preview"
                        width={80}
                        height={80}
                        unoptimized
                        className="size-20 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
                      />
                    ) : (
                      <div className="grid size-20 place-items-center rounded-lg border border-dashed border-zinc-300 bg-white text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
                        No photo
                      </div>
                    )}
                    <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                      <span className="font-medium">Choose face image</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        onChange={(event) =>
                          setPhotoFile(event.target.files?.[0] ?? null)
                        }
                        className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-800 hover:file:bg-zinc-100 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-medium">Card</h4>
                      <p className="text-xs text-zinc-500">
                        Up to 5 cards can be supported.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={form.cardNos.length >= 5}
                      onClick={() => {
                        updateForm("cardNos", [
                          ...form.cardNos,
                          { id: `draft-${nextCardFieldId}`, value: "" },
                        ]);
                        setNextCardFieldId((current) => current + 1);
                      }}
                      className="rounded-md border border-zinc-300 bg-background px-3 py-2 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Add Card
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {form.cardNos.map((card, index) => (
                      <div key={card.id} className="flex gap-2">
                        <input
                          maxLength={32}
                          value={card.value}
                          onChange={(event) =>
                            updateForm(
                              "cardNos",
                              form.cardNos.map((entry, cardIndex) =>
                                cardIndex === index
                                  ? { ...entry, value: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                          placeholder={`Card ${index + 1} number`}
                          autoComplete="off"
                          aria-label={`Card ${index + 1} number`}
                          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-background px-3 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700"
                        />
                        {form.cardNos.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateForm(
                                "cardNos",
                                form.cardNos.filter(
                                  (_, cardIndex) => cardIndex !== index,
                                ),
                              )
                            }
                            aria-label={`Remove card ${index + 1}`}
                            className="rounded-md border border-zinc-300 px-3 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-4 lg:col-span-2 dark:bg-zinc-900">
                  <div>
                    <h4 className="text-sm font-medium">Fingerprint</h4>
                    <p className="text-xs text-zinc-500">
                      Up to 10 fingerprints per device. Capture starts the
                      selected terminal&apos;s physical sensor.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex min-w-52 flex-1 flex-col gap-1.5 text-sm">
                      <span className="font-medium">Device</span>
                      <select
                        value={fingerprintDeviceId}
                        onChange={(event) =>
                          setFingerprintDeviceId(event.target.value)
                        }
                        className="h-10 rounded-md border border-zinc-300 bg-background px-3 dark:border-zinc-700"
                      >
                        <option value="">
                          {devices.length === 0
                            ? "No configured devices"
                            : "Select a device"}
                        </option>
                        {devices.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex w-36 flex-col gap-1.5 text-sm">
                      <span className="font-medium">Finger slot</span>
                      <select
                        value={fingerprintNo}
                        onChange={(event) =>
                          setFingerprintNo(event.target.value)
                        }
                        className="h-10 rounded-md border border-zinc-300 bg-background px-3 dark:border-zinc-700"
                      >
                        {FINGER_SLOTS.map((slot) => (
                          <option key={slot} value={slot}>
                            Finger {slot}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => void captureFingerprint()}
                      disabled={
                        fingerprintBusy || !editingId || !fingerprintDeviceId
                      }
                      className="h-10 rounded-md border border-zinc-300 bg-background px-4 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {fingerprintBusy
                        ? "Waiting for finger..."
                        : "Add Fingerprint"}
                    </button>
                    {editingId ? (
                      fingerprintMessage ? (
                        <output className="w-full text-xs text-zinc-600 dark:text-zinc-400">
                          {fingerprintMessage}
                        </output>
                      ) : null
                    ) : (
                      <p className="w-full text-sm text-zinc-600 dark:text-zinc-400">
                        Save the person first to enroll a fingerprint.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-zinc-200 p-4 sm:p-5 dark:border-zinc-800">
              <legend className="px-2 text-sm font-semibold">
                Authentication Settings
              </legend>
              <div className="flex flex-col gap-4">
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="font-medium">Authentication Type</legend>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        ["sameDevice", "Same as Device"],
                        ["custom", "Custom"],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 ${
                          form.authenticationType === value
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                            : "border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        <input
                          type="radio"
                          name="authenticationType"
                          checked={form.authenticationType === value}
                          onChange={() =>
                            updateForm("authenticationType", value)
                          }
                          className="accent-blue-600"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="flex max-w-xl flex-col gap-1.5 text-sm">
                  <span className="font-medium">Authentication</span>
                  <select
                    value={form.authenticationMode}
                    disabled={form.authenticationType !== "custom"}
                    onChange={(event) =>
                      updateForm(
                        "authenticationMode",
                        event.target.value as AuthenticationMode,
                      )
                    }
                    className="h-10 rounded-md border border-zinc-300 bg-background px-3 disabled:opacity-50 dark:border-zinc-700"
                  >
                    {AUTHENTICATION_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {authenticationLabel(mode)}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-zinc-500">
                    Same as Device leaves the terminal&apos;s user verification
                    mode unchanged. Custom sends the selected mode to each
                    terminal.
                  </span>
                </label>
              </div>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50/80 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                  setPhotoFile(null);
                  setFingerprintMessage(null);
                  setError(null);
                  setFeedback(null);
                }}
                className="rounded-md border border-zinc-300 bg-background px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
              {busy
                ? "Saving and syncing..."
                : editingId
                  ? "Save changes"
                  : "Add person"}
            </button>
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
                      {user.cardNos.length > 0 ? user.cardNos.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">
                        {readableType(user.userType)}
                      </span>
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
    </main>
  );
}
