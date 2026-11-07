import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ROOT, projectDir, getProject, saveProject, getTranscript, setTranscript, getRender, setRender, getEnv, listAssets, assetUrl, getSettings } from "./storage";
import { autoAssignPoses, autoCards, cardsFromText, compile } from "./compile";
import { vocalizeText } from "./tashkeel";

export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
export const PYTHON = process.env.PYTHON_PATH || (process.platform === "win32" ? "py" : "python3");

function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    const out: Buffer[] = [], err: Buffer[] = [];
    p.stdout.on("data", d => out.push(d));
    p.stderr.on("data", d => err.push(d));
    p.on("error", reject);
    p.on("close", code => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(Buffer.concat(err).toString().slice(-600) || `${cmd} exited ${code}`))));
  });
}

export async function probeDuration(file: string): Promise<number> {
  const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return Math.round(parseFloat(out.toString().trim()) * 1000) / 1000;
}

/** Loudness envelope at 30 fps (0..1), used by the voice-wave animation. */
export async function computeEnvelope(file: string): Promise<number[]> {
  const sr = 16000, fps = 30, hop = Math.round(sr / fps); // integer hop size (e.g. 533 samples)
  const raw = await run(FFMPEG, ["-v", "error", "-i", file, "-ac", "1", "-ar", String(sr), "-f", "s16le", "-"]);
  const totalSamples = Math.floor(raw.length / 2);
  const n = Math.floor(totalSamples / hop);
  const db: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const baseOffset = i * hop;
    for (let j = 0; j < hop; j++) {
      const sampleIdx = baseOffset + j;
      if (sampleIdx >= totalSamples) break;
      const v = raw.readInt16LE(sampleIdx * 2) / 32768;
      sum += v * v;
    }
    db.push(20 * Math.log10(Math.sqrt(sum / hop) + 1e-6));
  }
  const sorted = [...db].sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.95)] ?? -20;
  const env = db.map(v => Math.min(1, Math.max(0, (v - (ref - 35)) / 35)));
  return env.map((v, i) => Math.round((0.25 * (env[i - 1] ?? v) + 0.5 * v + 0.25 * (env[i + 1] ?? v)) * 1000) / 1000);
}

/* ---------- transcription (faster-whisper, python) ---------- */
const running = new Map<string, ReturnType<typeof spawn>>();

export async function startTranscription(id: string, referenceText?: string) {
  const p = await getProject(id);
  if (!p?.audio) throw new Error("لا يوجد ملف صوت");
  const settings = await getSettings();
  const dir = projectDir(id);
  const prev = await getTranscript(id);
  await setTranscript(id, { ...prev, status: "running", error: undefined, model: settings.whisperModel, updatedAt: new Date().toISOString() });

  const promptHint = referenceText?.trim() || p.title || "";
  running.get(`t-${id}`)?.kill();
  const child = spawn(PYTHON, [path.join(ROOT, "scripts", "transcribe.py"), path.join(dir, p.audio.file), path.join(dir, "transcript.json"), settings.whisperModel, promptHint], {
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", HF_HUB_DISABLE_SYMLINKS_WARNING: "1" },
  });
  running.set(`t-${id}`, child);
  let err = "";
  child.stderr.on("data", d => (err = (err + d.toString()).slice(-1500)));
  child.on("error", async e => { await setTranscript(id, { status: "error", words: [], text: "", error: `تعذر تشغيل Python: ${e.message}` }); });
  child.on("close", async code => {
    running.delete(`t-${id}`);
    if (code !== 0) {
      const t = await getTranscript(id);
      if (t.status !== "done") await setTranscript(id, { ...t, status: "error", error: err.split("\n").filter(Boolean).slice(-3).join("\n") || `exit ${code}` });
      return;
    }
    try {
      const [t, curProj] = await Promise.all([getTranscript(id), getProject(id)]);
      if (t.status === "done" && t.words.length && curProj && !curProj.cards.length) {
        const ref = referenceText?.trim();
        const cards = ref
          ? autoAssignPoses(cardsFromText(vocalizeText(ref), t.words, curProj.audio?.duration ?? 0))
          : autoCards(t.words);
        await saveProject({ ...curProj, cards });
      }
    } catch {}
  });
}

/* ---------- rendering (playwright + ffmpeg, node worker) ---------- */
export async function startRender(id: string, baseUrl: string, authCookie?: { name: string; value: string }) {
  const p = await getProject(id);
  if (!p?.audio) throw new Error("لا يوجد ملف صوت");
  if (!p.cards.some(c => c.lines.length)) throw new Error("لا توجد ترجمة بعد");
  const [t, env, assets, settings, current] = await Promise.all([getTranscript(id), getEnv(id), listAssets(), getSettings(), getRender(id)]);
  if (current.status === "running" && current.pid) killTree(current.pid);

  const byId = new Map(assets.map(a => [a.id, a]));
  const timeline = compile(p, t.words, env, iconId => { const a = byId.get(iconId); return a ? assetUrl(a) : ""; });
  const dir = projectDir(id);
  const input = {
    projectId: id,
    template: p.template,
    templateUrl: `${baseUrl}/templates/${p.template}/index.html`,
    timeline,
    audioPath: path.join(dir, p.audio.file),
    outDir: dir,
    outName: "video.mp4",
    workers: Math.max(1, Math.min(8, settings.renderWorkers || 3)),
    fps: 30,
    ffmpeg: FFMPEG,
    cookie: authCookie ? { ...authCookie, url: baseUrl } : null,
  };
  await fs.writeFile(path.join(dir, "render-input.json"), JSON.stringify(input));
  await setRender(id, { status: "running", progress: 0, stage: "التحضير", startedAt: new Date().toISOString() });

  const child = spawn(process.execPath, [path.join(ROOT, "scripts", "render.mjs"), path.join(dir, "render-input.json")], {
    windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "ignore", "pipe"],
  });
  let err = "";
  child.stderr?.on("data", d => (err = (err + d.toString()).slice(-1500)));
  await setRender(id, { status: "running", progress: 0, stage: "التحضير", startedAt: new Date().toISOString(), pid: child.pid });
  child.on("close", async code => {
    const r = await getRender(id);
    if (code !== 0 && r.status === "running") await setRender(id, { ...r, status: "error", error: err.split("\n").filter(Boolean).slice(-4).join("\n") || `exit ${code}` });
  });
}

export async function cancelRender(id: string) {
  const r = await getRender(id);
  if (r.pid) killTree(r.pid);
  await setRender(id, { status: "idle", progress: 0 });
}

/** kill a process together with its children (ffmpeg / browser) */
function killTree(pid: number) {
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    else process.kill(-pid, "SIGKILL");
  } catch { try { process.kill(pid); } catch {} }
}
