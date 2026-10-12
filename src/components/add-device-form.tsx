"use client";

import { type FormEvent, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  type DeviceInfo,
  type GateDirection,
  isGateDirection,
  type PublicDevice,
} from "@/lib/hik/types";
import { trpc } from "@/trpc/client";

type FormState = {
  label: string;
  host: string;
  port: string;
  scheme: "http" | "https";
  username: string;
  password: string;
  gateDirection: GateDirection;
};

const EMPTY: FormState = {
  label: "",
  host: "",
  port: "80",
  scheme: "http",
  username: "admin",
  password: "",
  gateDirection: "none",
};

export function AddDeviceForm({
  onAdded,
}: {
  onAdded: (device: PublicDevice, info: DeviceInfo) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = await trpc.devices.create.mutate({
        ...form,
        port: Number(form.port),
      });
      onAdded(payload.device, payload.info);
      setForm(EMPTY);
      setShowPassword(false);
    } catch {
      setError("Could not reach the app server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field className="lg:col-span-2">
          <FieldLabel htmlFor="device-host">IP address / hostname</FieldLabel>
          <Input
            id="device-host"
            required
            value={form.host}
            onChange={(event) => update("host", event.target.value)}
            placeholder="192.168.1.64"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="device-label">Label</FieldLabel>
          <Input
            id="device-label"
            value={form.label}
            onChange={(event) => update("label", event.target.value)}
            placeholder="Front door"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="device-direction">
            Attendance direction
          </FieldLabel>
          <Select
            value={form.gateDirection}
            onValueChange={(value) => {
              if (value && isGateDirection(value)) {
                update("gateDirection", value);
              }
            }}
          >
            <SelectTrigger id="device-direction" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="in">In</SelectItem>
                <SelectItem value="out">Out</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="device-username">Username</FieldLabel>
          <Input
            id="device-username"
            required
            value={form.username}
            onChange={(event) => update("username", event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="device-password">Password</FieldLabel>
          <Input
            id="device-password"
            required
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
            autoComplete="new-password"
            className="font-mono"
          />
        </Field>
        <Field className="sm:col-span-2 lg:col-span-3">
          <FieldLabel>Connection</FieldLabel>
          <div className="flex gap-2">
            <Input
              aria-label="Port"
              value={form.port}
              onChange={(event) =>
                update("port", event.target.value.replace(/\D/g, ""))
              }
              inputMode="numeric"
              className="w-24 font-mono"
            />
            <Select
              value={form.scheme}
              onValueChange={(value) => {
                if (value === "http" || value === "https") {
                  update("scheme", value);
                }
              }}
            >
              <SelectTrigger aria-label="Scheme" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="https">https</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Field orientation="horizontal" className="ml-2 items-center">
              <Checkbox
                id="show-device-password"
                checked={showPassword}
                onCheckedChange={(checked) => setShowPassword(checked === true)}
              />
              <FieldLabel htmlFor="show-device-password">
                Show password
              </FieldLabel>
            </Field>
          </div>
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Testing connection…" : "Add device"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Credentials are verified before saving and remain server-side in
          SQLite.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
