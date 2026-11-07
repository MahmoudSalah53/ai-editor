import { connection } from "next/server";
import { getSettings } from "@/lib/storage";
import { SettingsView } from "@/components/settings/SettingsView";

export default async function SettingsPage() {
  await connection();
  const settings = await getSettings();
  return <SettingsView initial={settings} />;
}
