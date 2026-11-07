import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getProject, projectDir, saveProject, setEnv, setTranscript } from "@/lib/storage";
import { computeEnvelope, probeDuration, startTranscription } from "@/lib/jobs";

const ALLOWED = new Set([".ogg", ".opus", ".mp3", ".m4a", ".aac", ".wav", ".webm", ".mp4", ".flac"]);

export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/audio">) {
  const { id } = await ctx.params;
  const p = await getProject(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const referenceText = typeof form.get("referenceText") === "string" ? (form.get("referenceText") as string) : undefined;
  if (!(file instanceof File)) return NextResponse.json({ error: "لم يتم إرسال ملف" }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase() || ".ogg";
  if (!ALLOWED.has(ext)) return NextResponse.json({ error: "صيغة الملف غير مدعومة" }, { status: 400 });

  const dir = projectDir(id);
  // remove an older voice file with a different extension
  for (const f of await fs.readdir(dir)) if (f.startsWith("voice.")) await fs.rm(path.join(dir, f), { force: true });
  const name = `voice${ext}`;
  const full = path.join(dir, name);
  await fs.writeFile(full, Buffer.from(await file.arrayBuffer()));

  try {
    const [duration, env] = await Promise.all([probeDuration(full), computeEnvelope(full)]);
    await setEnv(id, env);
    const saved = await saveProject({ ...p, audio: { file: name, duration }, cards: [] });
    await setTranscript(id, { status: "idle", words: [], text: "" });
    await startTranscription(id, referenceText);
    return NextResponse.json({ audio: saved.audio, env });
  } catch (e) {
    return NextResponse.json({ error: `تعذر قراءة الملف الصوتي: ${(e as Error).message}` }, { status: 400 });
  }
}
