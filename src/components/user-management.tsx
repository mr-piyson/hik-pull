"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { Label } from "./ui/label";

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
  longTermEffective: true,
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
  mode,
  initialUser,
}: {
  initialUsers: ManagedUser[];
  mode: "directory" | "create" | "edit";
  initialUser?: ManagedUser;
}) {
  const isDirectory = mode === "directory";
  const [editingId, setEditingId] = useState<string | null>(
    mode === "edit" ? (initialUser?.id ?? null) : null,
  );
  const [users, setUsers] = useState(initialUsers);
  const [devices, setDevices] = useState<PublicDevice[]>([]);
  const [form, setForm] = useState<UserForm>(() =>
    initialUser ? toForm(initialUser) : EMPTY_FORM,
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [savedPhotoUrl, setSavedPhotoUrl] = useState<string | null>(null);
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
  const editingUser = initialUser ?? null;
  const currentPhoto =
    photoPreview ?? savedPhotoUrl ?? editingUser?.photoUrl ?? null;

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
          photoUrl?: string;
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
        setSavedPhotoUrl(
          photoPayload.photoUrl ?? `/api/users/${payload.user.id}/photo`,
        );
        message = `Photo optimized to ${(photoPayload.sizeBytes / 1024).toFixed(1)} KB. ${syncSummary(photoPayload.results ?? [])}`;
      }
      setFeedback(message);
      if (!editingId) {
        setForm(EMPTY_FORM);
        setSavedPhotoUrl(null);
      } else {
        setForm(toForm(savedUser));
      }
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
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Directory
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {isDirectory
                ? "People"
                : editingId
                  ? "Edit person"
                  : "Add person"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              The database is the source of truth. People are assigned to Door 1
              with plan template 1; authentication inherits each terminal&apos;s
              setting.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isDirectory ? (
              <>
                <Badge variant="secondary" className="h-7 px-3">
                  {users.length} master records
                </Badge>
                <Button render={<Link href="/people/new" />}>Add person</Button>
              </>
            ) : (
              <Button variant="outline" render={<Link href="/people" />}>
                Back to people
              </Button>
            )}
          </div>
        </div>

        {!isDirectory ? (
          <form onSubmit={submit} className="overflow-hidden rounded-xl">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b">
                <div>
                  <CardTitle>
                    {editingId ? "Edit person" : "Add person"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Person details, credentials, and authentication settings
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  Synced to {devices.length} device
                  {devices.length === 1 ? "" : "s"}
                </Badge>
              </CardHeader>

              <CardContent className="flex flex-col gap-5">
                <FieldSet className="rounded-xl border p-4 sm:p-5">
                  <FieldLegend>Basic Information</FieldLegend>
                  <FieldGroup className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="employee-no">
                        Employee ID <span className="text-destructive">*</span>
                      </FieldLabel>
                      <Input
                        id="employee-no"
                        required
                        maxLength={32}
                        value={form.employeeNo}
                        disabled={Boolean(editingId)}
                        onChange={(event) =>
                          updateForm("employeeNo", event.target.value)
                        }
                        placeholder="5738"
                        autoComplete="off"
                        className="font-mono"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="person-name">
                        Name <span className="text-destructive">*</span>
                      </FieldLabel>
                      <Input
                        id="person-name"
                        required
                        maxLength={64}
                        value={form.name}
                        onChange={(event) =>
                          updateForm("name", event.target.value)
                        }
                        placeholder="Full name"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="floor-number">Floor No.</FieldLabel>
                      <Input
                        id="floor-number"
                        type="number"
                        min={0}
                        max={2147483647}
                        value={form.floorNumber}
                        onChange={(event) =>
                          updateForm("floorNumber", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="room-number">Room No.</FieldLabel>
                      <Input
                        id="room-number"
                        type="number"
                        min={0}
                        max={2147483647}
                        value={form.roomNumber}
                        onChange={(event) =>
                          updateForm("roomNumber", event.target.value)
                        }
                      />
                    </Field>
                    <FieldSet>
                      <FieldLegend variant="label">Gender</FieldLegend>
                      <ToggleGroup
                        aria-label="Gender"
                        value={[form.gender]}
                        onValueChange={(values) => {
                          const gender = GENDERS.find(
                            (option) => option === values[0],
                          );
                          if (gender) {
                            updateForm("gender", gender);
                          }
                        }}
                        variant="outline"
                      >
                        {GENDERS.map((gender) => (
                          <ToggleGroupItem
                            key={gender}
                            value={gender}
                            className="capitalize"
                          >
                            {gender}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FieldSet>
                    <FieldSet>
                      <FieldLegend variant="label">Person Type</FieldLegend>
                      <ToggleGroup
                        aria-label="Person type"
                        value={[form.userType]}
                        onValueChange={(values) => {
                          const type = USER_TYPES.find(
                            (option) => option === values[0],
                          );
                          if (type) {
                            updateForm("userType", type);
                          }
                        }}
                        variant="outline"
                      >
                        {USER_TYPES.map((type) => (
                          <ToggleGroupItem key={type} value={type}>
                            {type === "normal"
                              ? "Normal User"
                              : type === "blackList"
                                ? "Blocklist User"
                                : "Visitor"}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </FieldSet>
                    <Label>
                      <Field
                        orientation="horizontal"
                        className="min-h-11 items-center justify-between gap-4 rounded-lg border px-3 py-2"
                      >
                        <FieldContent>
                          <FieldLabel htmlFor="long-term-effective">
                            Long-Term Effective User
                          </FieldLabel>
                          <FieldDescription>
                            Ignore the validity end date
                          </FieldDescription>
                        </FieldContent>
                        <Checkbox
                          id="long-term-effective"
                          checked={form.longTermEffective}
                          className={"border-primary"}
                          onCheckedChange={(checked) =>
                            updateForm("longTermEffective", checked === true)
                          }
                        />
                      </Field>
                    </Label>
                    <Label>
                      <Field
                        orientation="horizontal"
                        className="min-h-11 items-center justify-between gap-4 rounded-lg border px-3 py-2"
                      >
                        <FieldContent>
                          <FieldLabel htmlFor="user-administrator">
                            Administrator
                          </FieldLabel>
                          <FieldDescription>
                            Allow local device UI privileges
                          </FieldDescription>
                        </FieldContent>
                        <Checkbox
                          id="user-administrator"
                          checked={form.isAdministrator}
                          onCheckedChange={(checked) =>
                            updateForm("isAdministrator", checked === true)
                          }
                        />
                      </Field>
                    </Label>
                    <Field>
                      <FieldLabel htmlFor="visit-times">Visit Times</FieldLabel>
                      <Input
                        id="visit-times"
                        type="number"
                        min={0}
                        max={2147483647}
                        value={form.visitTimes}
                        onChange={(event) =>
                          updateForm("visitTimes", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="valid-from">
                        Start Time (device local)
                      </FieldLabel>
                      <Input
                        id="valid-from"
                        type="datetime-local"
                        max="2037-12-31T23:59"
                        disabled={form.longTermEffective}
                        value={form.validFrom}
                        onChange={(event) =>
                          updateForm("validFrom", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="valid-until">
                        End Time (device local)
                      </FieldLabel>
                      <Input
                        id="valid-until"
                        type="datetime-local"
                        max="2037-12-31T23:59"
                        disabled={form.longTermEffective}
                        value={form.validUntil}
                        onChange={(event) =>
                          updateForm("validUntil", event.target.value)
                        }
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>

                <FieldSet className="rounded-xl border p-4 sm:p-5">
                  <FieldLegend>Certificate Configuration</FieldLegend>
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="flex flex-col gap-3 rounded-lg bg-muted p-4">
                      <div>
                        <h4 className="text-sm font-medium">Face</h4>
                        <p className="text-xs text-muted-foreground">
                          JPEG, PNG, WebP or AVIF. Compressed below 200 KB
                          before enrollment.
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
                            className="size-20 rounded-lg border object-cover"
                          />
                        ) : (
                          <div className="grid size-20 place-items-center rounded-lg border border-dashed bg-card text-xs text-muted-foreground">
                            No photo
                          </div>
                        )}
                        <Field className="min-w-0 flex-1">
                          <FieldLabel htmlFor="face-photo">
                            Choose face image
                          </FieldLabel>
                          <Input
                            id="face-photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            onChange={(event) =>
                              setPhotoFile(event.target.files?.[0] ?? null)
                            }
                            className="max-w-sm"
                          />
                        </Field>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg bg-muted p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-medium">Card</h4>
                          <p className="text-xs text-muted-foreground">
                            Up to 5 cards can be supported.
                          </p>
                        </div>
                        <Button
                          type="button"
                          disabled={form.cardNos.length >= 5}
                          onClick={() => {
                            updateForm("cardNos", [
                              ...form.cardNos,
                              { id: `draft-${nextCardFieldId}`, value: "" },
                            ]);
                            setNextCardFieldId((current) => current + 1);
                          }}
                          variant="outline"
                          size="sm"
                        >
                          Add Card
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2">
                        {form.cardNos.map((card, index) => (
                          <div key={card.id} className="flex gap-2">
                            <Input
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
                              className="min-w-0 flex-1 font-mono"
                            />
                            {form.cardNos.length > 1 ? (
                              <Button
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
                                variant="outline"
                                size="sm"
                              >
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 lg:col-span-2">
                      <div>
                        <h4 className="text-sm font-medium">Fingerprint</h4>
                        <p className="text-xs text-muted-foreground">
                          Up to 10 fingerprints per device. Capture starts the
                          selected terminal&apos;s physical sensor.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex min-w-52 flex-1 flex-col gap-1.5 text-sm">
                          <span className="font-medium">Device</span>
                          <Select
                            value={fingerprintDeviceId || null}
                            onValueChange={(value) =>
                              setFingerprintDeviceId(value ?? "")
                            }
                            disabled={devices.length === 0}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue
                                placeholder={
                                  devices.length === 0
                                    ? "No configured devices"
                                    : "Select a device"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {devices.map((device) => (
                                  <SelectItem key={device.id} value={device.id}>
                                    {device.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex w-36 flex-col gap-1.5 text-sm">
                          <span className="font-medium">Finger slot</span>
                          <Select
                            value={fingerprintNo}
                            onValueChange={(value) => {
                              if (value) {
                                setFingerprintNo(value);
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {FINGER_SLOTS.map((slot) => (
                                  <SelectItem key={slot} value={String(slot)}>
                                    Finger {slot}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          onClick={() => void captureFingerprint()}
                          disabled={
                            fingerprintBusy ||
                            !editingId ||
                            !fingerprintDeviceId
                          }
                          variant="outline"
                        >
                          {fingerprintBusy
                            ? "Waiting for finger..."
                            : "Add Fingerprint"}
                        </Button>
                        {editingId ? (
                          fingerprintMessage ? (
                            <output className="w-full text-xs text-muted-foreground">
                              {fingerprintMessage}
                            </output>
                          ) : null
                        ) : (
                          <p className="w-full text-sm text-muted-foreground">
                            Save the person first to enroll a fingerprint.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </FieldSet>

                <FieldSet className="rounded-xl border p-4 sm:p-5">
                  <FieldLegend>Authentication Settings</FieldLegend>
                  <div className="flex flex-col gap-4">
                    <FieldSet>
                      <FieldLegend variant="label">
                        Authentication Type
                      </FieldLegend>
                      <ToggleGroup
                        aria-label="Authentication type"
                        value={[form.authenticationType]}
                        onValueChange={(values) => {
                          const value = values[0];
                          if (value === "sameDevice" || value === "custom") {
                            updateForm("authenticationType", value);
                          }
                        }}
                        variant="outline"
                      >
                        <ToggleGroupItem value="sameDevice">
                          Same as Device
                        </ToggleGroupItem>
                        <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
                      </ToggleGroup>
                    </FieldSet>
                    <Field className="max-w-xl">
                      <FieldLabel htmlFor="authentication-mode">
                        Authentication
                      </FieldLabel>
                      <Select
                        value={form.authenticationMode}
                        disabled={form.authenticationType !== "custom"}
                        onValueChange={(value) => {
                          if (
                            value &&
                            AUTHENTICATION_MODES.includes(
                              value as AuthenticationMode,
                            )
                          ) {
                            updateForm(
                              "authenticationMode",
                              value as AuthenticationMode,
                            );
                          }
                        }}
                      >
                        <SelectTrigger
                          id="authentication-mode"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {AUTHENTICATION_MODES.map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {authenticationLabel(mode)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Same as Device leaves the terminal&apos;s user
                        verification mode unchanged. Custom sends the selected
                        mode to each terminal.
                      </FieldDescription>
                    </Field>
                  </div>
                </FieldSet>
              </CardContent>

              <CardFooter className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" render={<Link href="/people" />}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? "Saving and syncing..."
                    : editingId
                      ? "Save changes"
                      : "Add person"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        ) : null}

        {error || feedback ? (
          <Alert
            variant={error ? "destructive" : "default"}
            role={error ? "alert" : "status"}
          >
            <AlertDescription>{error ?? feedback}</AlertDescription>
          </Alert>
        ) : null}

        {isDirectory ? (
          <Card className="min-w-0">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Master directory</CardTitle>
                <CardDescription>
                  Search and manage people and credentials.
                </CardDescription>
              </div>
              <label className="sr-only" htmlFor="user-search">
                Search users
              </label>
              <Input
                id="user-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, employee or card"
                className="w-full max-w-xs"
              />
            </CardHeader>
            <CardContent>
              <Table className="min-w-[58rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Employee no.</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead>Type / validity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
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
                            <span className="grid size-9 place-items-center rounded-lg bg-muted font-mono text-[9px] text-muted-foreground">
                              —
                            </span>
                          )}
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {user.employeeNo}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {user.cardNos.length > 0
                          ? user.cardNos.join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <span className="block">
                          {readableType(user.userType)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {user.validFrom
                            ? `From ${formatDate(user.validFrom)} · `
                            : ""}
                          Until {formatDate(user.validUntil)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            disabled={busyUserId === user.id || busy}
                            onClick={() => void retry(user)}
                            variant="outline"
                            size="sm"
                          >
                            {busyUserId === user.id ? "Syncing…" : "Sync"}
                          </Button>
                          <Button
                            disabled={busyUserId === user.id || busy}
                            render={<Link href={`/people/${user.id}/edit`} />}
                            variant="outline"
                            size="sm"
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            disabled={busyUserId === user.id || busy}
                            onClick={() => void remove(user)}
                            variant="destructive"
                            size="sm"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleUsers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {users.length === 0
                          ? "No people yet. Add a master record above."
                          : "No users match this search."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </main>
  );
}
