import { connection } from "next/server";
import { listProjects, getSettings } from "@/lib/storage";
import { ProjectsView } from "@/components/projects/ProjectsView";

export default async function Home() {
  await connection();
  const [projects, settings] = await Promise.all([listProjects(), getSettings()]);
  return <ProjectsView projects={projects} channelName={settings.channelName} />;
}
