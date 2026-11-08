import "server-only";
import { promises as fs, existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { uid } from "./compile";
import type { Asset, Project, RenderState, Settings, TemplateId, TranscriptState } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export const ROOT = process.cwd();
export const DATA_DIR = process.env.STUDIO_DATA_DIR || path.join(ROOT, "data");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const ASSETS_DIR = path.join(DATA_DIR, "assets");

export const SEED_ICONS: Record<string, string> = {
  icon_book: "كتاب ومصنف",
  icon_finger_up: "إصبع التوحيد",
  icon_gift_heart: "هدية وعطاء",
  icon_heart_glow: "قلب مطمئن بالإيمان",
  icon_hands_receive: "يدان مرفوعتان للدعاء",
  icon_all_good: "البركة وكل الخير",
  icon_mosque: "مسجد ومنارة",
  icon_scale: "ميزان العدل والحساب",
  icon_shield: "درع الوقاية والحفظ",
  icon_coins: "صدقة وإنفاق المال",
  icon_lantern: "فانوس النور والهداية",
  icon_paradise: "نخلة وأنهار الجنة",
  icon_warning: "تحذير من التهلكة",
  icon_kaaba: "الكعبة المشرفة",
  icon_time: "ساعة رملية والوقت",
  icon_mercy_rain: "غيث الرحمة والفرج",
};

export const SEED_DESCRIPTIONS: Record<string, string> = {
  icon_book: "يختار فقط عند ذكر: رواية الحديث، المصنف، الكتاب، الراوي، في تفسيرها، قال الطبري، ابن أبي شيبة، البخاري، مسلم، قراءة القرآن",
  icon_finger_up: "يختار فقط عند ذكر: الله تعالى، القسم بالله (والذي لا إله غيره)، التوحيد، العقيدة، الإخلاص لله وحده، قال الله تعالى",
  icon_gift_heart: "يختار فقط عند ذكر: هدية أو عطاء من الله (ما أعطي عبد عطاءً)، الفضل، الهدية، التهادي، الإكرام",
  icon_heart_glow: "يختار فقط عند ذكر: حسن الظن بالله، صلاح القلب، الإيمان، محبة الله (إن الله يحب المحسنين)، الطمأنينة، اليقين",
  icon_hands_receive: "يختار فقط عند ذكر: الدعاء، سؤال الله، الاستجابة (إلا أعطاه الله ذلك)، الرجاء، التضرع، اللهم",
  icon_all_good: "يختار فقط عند ذكر: اجتماع الخيرات (إن الخير كله بيديه)، البركة الشاملة، يبركم، صلاح الدنيا والآخرة",
  icon_mosque: "يختار فقط عند ذكر: المسجد، الصلاة، الجماعة، بيوت الله، الأذان، الركوع والسجود، العبادة",
  icon_scale: "يختار فقط عند ذكر: العدل، الميزان، الحساب يوم القيامة، القسط، وزن الأعمال، الحسنات والسيئات، الحق",
  icon_shield: "يختار فقط عند ذكر: الوقاية، الحفظ، التحصين، الأمان، النجاة من البلاء، التوكل، الصبر عند الشدائد",
  icon_coins: "يختار فقط عند ذكر: الإنفاق في سبيل الله (وأنفقوا في سبيل الله)، الصدقة، الزكاة، المال، الكرم المالي، إطعام المسكين",
  icon_lantern: "يختار فقط عند ذكر: النور، الهداية، الحكمة، العلم النافع، البصيرة، إضاءة الطريق، شهر رمضان",
  icon_paradise: "يختار فقط عند ذكر: الجنة، دار النعيم، الثواب العظيم، الأجر في الآخرة، أنهار الجنة، الفوز الكبير",
  icon_warning: "يختار فقط عند ذكر: التحذير، النهي (ولا تلقوا بأيديكم إلى التهلكة)، الخطر، الهلاك، المعاصي، اليأس والقنوط",
  icon_kaaba: "يختار فقط عند ذكر: الكعبة المشرفة، الحج، العمرة، مكة، القبلة، البيت الحرام، الطواف",
  icon_time: "يختار فقط عند ذكر: الوقت، العمر، مرور الأيام، الصبر الطويل، المبادرة قبل الفوات، الدنيا الفانية",
  icon_mercy_rain: "يختار فقط عند ذكر: رحمة الله، الغيث، المطر، الفرج بعد الشدة، الرزق من السماء، إحياء الأرض والقلوب",
};

let ready = false;
function ensure() {
  if (ready) return;
  for (const d of [DATA_DIR, PROJECTS_DIR, ASSETS_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });
  const index = path.join(ASSETS_DIR, "assets.json");
  const seedDir = path.join(ROOT, "seed", "icons");
  let assets: Asset[] = [];
  if (existsSync(index)) {
    try { assets = JSON.parse(readFileSync(index, "utf8")); } catch { assets = []; }
  }
  if (existsSync(seedDir)) {
    const existingIds = new Set(assets.map(a => a.id));
    let changed = !existsSync(index);
    for (const f of readdirSync(seedDir)) {
      const id = path.parse(f).name;
      const dest = path.join(ASSETS_DIR, f);
      if (!existsSync(dest)) copyFileSync(path.join(seedDir, f), dest);
      if (!existingIds.has(id)) {
        assets.push({ id, name: SEED_ICONS[id] ?? id, description: SEED_DESCRIPTIONS[id], file: f, createdAt: new Date().toISOString() });
        changed = true;
      } else {
        // Update seed name/description if it's a built-in seed icon
        const item = assets.find(a => a.id === id);
        if (item && SEED_DESCRIPTIONS[id] && item.description !== SEED_DESCRIPTIONS[id]) {
          item.name = SEED_ICONS[id] ?? item.name;
          item.description = SEED_DESCRIPTIONS[id];
          changed = true;
        }
      }
    }
    if (changed) writeFileSync(index, JSON.stringify(assets, null, 1));
  }
  ready = true;
}

/* ---------- json helpers ---------- */
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; } catch { return fallback; }
}
async function writeJson(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.rename(tmp, file);
}

export const isSafeId = (id: string) => /^[a-z0-9-]{4,40}$/.test(id);
export function projectDir(id: string) {
  if (!isSafeId(id)) throw new Error("bad id");
  ensure();
  return path.join(PROJECTS_DIR, id);
}

/* ---------- settings ---------- */
export async function getSettings(): Promise<Settings> {
  ensure();
  const s = await readJson<Partial<Settings>>(path.join(DATA_DIR, "settings.json"), {});
  return { ...DEFAULT_SETTINGS, ...s, timing: { ...DEFAULT_SETTINGS.timing, ...(s.timing ?? {}) } };
}
export async function saveSettings(s: Settings) {
  ensure();
  await writeJson(path.join(DATA_DIR, "settings.json"), s);
}

/* ---------- projects ---------- */
export async function createProject(title: string, template: TemplateId): Promise<Project> {
  const s = await getSettings();
  const now = new Date().toISOString();
  const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${uid().slice(0, 6)}`;
  const p: Project = { id, title: title || "مشروع جديد", template, channelName: s.channelName, createdAt: now, updatedAt: now, timing: { ...s.timing }, cards: [] };
  await fs.mkdir(projectDir(id), { recursive: true });
  await writeJson(path.join(projectDir(id), "project.json"), p);
  return p;
}

export async function getProject(id: string): Promise<Project | null> {
  if (!isSafeId(id)) return null;
  return readJson<Project | null>(path.join(projectDir(id), "project.json"), null);
}

export async function saveProject(p: Project): Promise<Project> {
  const next = { ...p, updatedAt: new Date().toISOString() };
  await writeJson(path.join(projectDir(p.id), "project.json"), next);
  return next;
}

export async function deleteProject(id: string) {
  await fs.rm(projectDir(id), { recursive: true, force: true });
}

export interface ProjectSummary {
  id: string; title: string; template: TemplateId; updatedAt: string; createdAt: string;
  duration?: number; transcript: TranscriptState["status"]; render: RenderState["status"]; progress: number; output?: string;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  ensure();
  const ids = (await fs.readdir(PROJECTS_DIR, { withFileTypes: true })).filter(d => d.isDirectory() && isSafeId(d.name)).map(d => d.name);
  const items = await Promise.all(ids.map(async (id): Promise<ProjectSummary | null> => {
    const [p, t, r] = await Promise.all([getProject(id), getTranscript(id), getRender(id)]);
    if (!p) return null;
    return { id, title: p.title, template: p.template, updatedAt: p.updatedAt, createdAt: p.createdAt, duration: p.audio?.duration, transcript: t.status, render: r.status, progress: r.progress, output: r.output };
  }));
  return items.filter((x): x is ProjectSummary => x !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* ---------- per-project side files ---------- */
export const getTranscript = (id: string) =>
  readJson<TranscriptState>(path.join(projectDir(id), "transcript.json"), { status: "idle", words: [], text: "" });
export const setTranscript = (id: string, t: TranscriptState) => writeJson(path.join(projectDir(id), "transcript.json"), t);

export const getRender = (id: string) =>
  readJson<RenderState & { pid?: number }>(path.join(projectDir(id), "render.json"), { status: "idle", progress: 0 });
export const setRender = (id: string, r: RenderState & { pid?: number }) => writeJson(path.join(projectDir(id), "render.json"), r);

export const getEnv = (id: string) => readJson<number[]>(path.join(projectDir(id), "env.json"), []);
export const setEnv = (id: string, env: number[]) => writeJson(path.join(projectDir(id), "env.json"), env);

/* ---------- assets ---------- */
const assetsIndex = () => path.join(ASSETS_DIR, "assets.json");
export async function listAssets(): Promise<Asset[]> {
  ensure();
  const list = await readJson<Asset[]>(assetsIndex(), []);
  return list.map(a => ({
    ...a,
    description: a.description ?? SEED_DESCRIPTIONS[a.id],
  }));
}
export async function saveAssets(assets: Asset[]) {
  ensure();
  await writeJson(assetsIndex(), assets);
}
export async function addAsset(name: string, data: Buffer, ext: string, description?: string): Promise<Asset> {
  const assets = await listAssets();
  const id = `a-${uid()}`;
  const file = `${id}${ext}`;
  await fs.writeFile(path.join(ASSETS_DIR, file), data);
  const a: Asset = { id, name: name || "صورة", description, file, createdAt: new Date().toISOString() };
  await writeJson(assetsIndex(), [...assets, a]);
  return a;
}
export async function updateAsset(id: string, patch: { name?: string; description?: string }) {
  const assets = await listAssets();
  await writeJson(
    assetsIndex(),
    assets.map(a =>
      a.id === id
        ? {
            ...a,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
          }
        : a
    )
  );
}
export async function deleteAsset(id: string) {
  const assets = await listAssets();
  const a = assets.find(x => x.id === id);
  if (a) await fs.rm(path.join(ASSETS_DIR, a.file), { force: true });
  await writeJson(assetsIndex(), assets.filter(x => x.id !== id));
}

export const assetUrl = (a: Pick<Asset, "file">) => `/api/files/assets/${encodeURIComponent(a.file)}`;
