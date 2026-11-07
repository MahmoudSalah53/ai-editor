import { notFound } from "next/navigation";
import { connection } from "next/server";
import { assetUrl, getEnv, getProject, getRender, getTranscript, listAssets } from "@/lib/storage";
import { Editor } from "@/components/editor/Editor";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [project, transcript, render, env, assets] = await Promise.all([
    getProject(id),
    getTranscript(id),
    getRender(id),
    getEnv(id),
    listAssets(),
  ]);
  if (!project) notFound();

  return (
    <Editor
      initial={{ project, transcript, render, env }}
      initialAssets={assets.map(a => ({ ...a, url: assetUrl(a) }))}
    />
  );
}
