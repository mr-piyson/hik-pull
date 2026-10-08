import { SettingsPanel } from "@/components/settings-panel";
import { getAppSettings } from "@/lib/hik/settings-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getAppSettings();
  return <SettingsPanel initialSettings={settings} />;
}
