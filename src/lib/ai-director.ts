import "server-only";
import { normalize } from "./arabic";
import { inferPose } from "./compile";
import { vocalizeText } from "./tashkeel";
import type { Asset, Card, PoseId } from "./types";

const CLOUD_AI_URL = process.env.AI_API_URL || "https://text.pollinations.ai/openai";
const CLOUD_AI_MODEL = process.env.AI_MODEL || "openai";

const VALID_POSES = new Set<string>(["present", "point_up", "book", "heart"]);

/** Check if an asset name looks like a raw filename (numbers, English-only, or generic "صورة"). */
function needsBetterName(name: string): boolean {
  const t = name.trim();
  if (!t || t === "صورة" || /^a-[a-z0-9]+$/i.test(t) || /^[0-9_-]+$/.test(t)) return true;
  // If it has no Arabic letters at all (pure English filename like "heart_icon")
  if (!/[\u0600-\u06FF]/.test(t)) return true;
  return false;
}

/**
 * Automatically gives any unnamed or undescribed icons in the library
 * a clear Arabic name and semantic description ("متى يختارها الـ AI") using Free Cloud AI.
 */
export async function autoDescribeAssets(assets: Asset[]): Promise<{ assets: Asset[]; changed: boolean }> {
  const targets = assets.filter(a => needsBetterName(a.name) || !a.description?.trim());
  if (!targets.length) return { assets, changed: false };

  const updates = new Map<string, { name?: string; description?: string }>();

  try {
    const prompt = [
      "أنت مساعد ذكي لتنظيم مكتبة رسومات توضيحية لفيديوهات ريلز إسلامية وتربوية.",
      "لكل رسمة في القائمة التالية، إذا كان اسمها بالإنجليزية أو غير واضح فاقترح اسماً عربياً واضحاً من كلمتين أو ثلاث،",
      "واكتب وصفاً دلالياً قصيراً (description) يوضح الكلمات المفتاحية والمعاني التي تناسب ظهور هذه الرسمة في الفيديو.",
      "أرجع JSON فقط بهذا الشكل:",
      '{"items":[{"id":"...","name":"اسم عربي واضح","description":"يستخدم عند ذكر ..."}]}',
      "القائمة:",
      JSON.stringify(targets.map(a => ({ id: a.id, currentName: a.name, file: a.file, currentDescription: a.description ?? "" }))),
    ].join("\n");

    const res = await fetch(CLOUD_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: CLOUD_AI_MODEL,
        reasoning_effort: "low",
        max_tokens: 2500,
        messages: [
          { role: "system", content: "Return valid JSON only with minimal reasoning." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content;
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw) as { items?: Array<{ id?: string; name?: string; description?: string }> };
        for (const item of parsed.items ?? []) {
          if (item?.id) {
            updates.set(item.id, {
              name: item.name?.trim(),
              description: item.description?.trim(),
            });
          }
        }
      }
    }
  } catch {
    // Fallback to local enrichment below
  }

  let changed = false;
  const next = assets.map(a => {
    const u = updates.get(a.id);
    const nextName = needsBetterName(a.name) ? (u?.name || a.name) : a.name;
    const nextDesc = a.description?.trim() || u?.description || `يستخدم عند الحديث عن ${nextName}`;
    if (nextName !== a.name || nextDesc !== a.description) changed = true;
    return { ...a, name: nextName, description: nextDesc };
  });

  return { assets: next, changed };
}

/**
 * Semantic fallback matcher: scores a line of Arabic text against all available library assets
 * using their Arabic names and descriptions.
 */
function matchBestAssetLocally(text: string, assets: Asset[]): { asset: Asset; score: number } | null {
  if (!assets.length) return null;
  const normLine = normalize(text);
  const lineWords = normLine.split(/\s+/).filter(w => w.length >= 2);
  if (!lineWords.length) return null;

  let best: { asset: Asset; score: number } | null = null;
  for (const a of assets) {
    const corpus = normalize(`${a.name} ${a.description ?? ""}`);
    let score = 0;
    for (const w of lineWords) {
      const stem = w.replace(/^(وال|فال|بال|كال|لل|ال|و|ف|ب)/, "");
      if (stem.length >= 3 && corpus.includes(stem)) {
        score += 2;
      } else if (w.length >= 3 && corpus.includes(w)) {
        score += 1.5;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { asset: a, score };
    }
  }
  return best;
}

interface AiLineDecision {
  i: string;
  p?: string;    // "present" | "point_up" | "book" | "heart" | "same"
  s?: string;    // "icon" | "same" | "none"
  ic?: string;   // icon id
  lbl?: string;  // short label under icon
  acc?: boolean; // accent highlight
}

/**
 * Uses Free Cloud AI (plus semantic validation) to automatically organize
 * character hand poses, illustrations/emojis, "same as previous", and labels across all lines.
 */
export async function aiDirectProject(cards: Card[], assets: Asset[]): Promise<{ cards: Card[]; source: "cloud-ai" | "local-smart" }> {
  const flatLines = cards.flatMap(c => c.lines);
  if (!flatLines.length) return { cards, source: "local-smart" };

  const validIconIds = new Set(assets.map(a => a.id));
  const aiMap = new Map<string, AiLineDecision>();
  let usedCloud = false;

  try {
    const iconCatalog = assets.map(a => ({
      id: a.id,
      name: a.name,
      whenToUse: a.description || a.name,
    }));

    const lineList = flatLines.map((l, idx) => ({
      i: l.id,
      idx: idx + 1,
      text: l.text,
    }));

    const prompt = [
      "أنت مخرج فني ذكي لمقاطع الريلز الإسلامية والتربوية القصيرة.",
      "مهمتك توزيع (حركة يد الشخصية) و(الرسمة التوضيحية/الإيموجي) لكل سطر من أسطر الفيديو بذكاء وتناسق بصري.",
      "",
      "حركات اليد المتاحة (p):",
      "- point_up: يشير بإصبعه لأعلى (عند ذكر الله تعالى، قال الله، القسم بالله، التوحيد)",
      "- book: يمسك كتاباً (عند ذكر الراوي، رواه، مصنف، الطبري، البخاري، في تفسيرها)",
      "- heart: يضع يده على قلبه (عند ذكر المحبة، الإحسان، يحب المحسنين، حسن الظن بالله، القلب، الإيمان)",
      "- present: يشرح بيده (للشرح العام، الأمر بالإنفاق، العطاء، بداية الكلام)",
      "- same: استمرار نفس حركة اليد من السطر السابق إذا كان السطر مكملاً لنفس الجملة",
      "",
      "حالات الرسمة التوضيحية (s):",
      "- icon: إظهار رسمة جديدة من القائمة المتاحة أدناه (حدد معرفها في ic وعنواناً عربياً قصيراً من كلمتين أو 3 في lbl)",
      "- same: استمرار ظهور نفس الرسمة من السطر السابق (استخدمها عندما يكون السطر تكملة لنفس المعنى أو الآية من السطر السابق حتى لا تختفي الرسمة بسرعة)",
      "- none: بدون رسمة (تختفي الرسمة السابقة إذا كان السطر لا يناسبه أي رسمة أو انتقل لمعنى تمهيدي)",
      "",
      "قائمة الرسومات المتاحة في المكتبة (اختر فقط من هذه الـ id):",
      JSON.stringify(iconCatalog),
      "",
      "الأسطر المطلوب إخراجها بالترتيب:",
      JSON.stringify(lineList),
      "",
      'أرجع JSON فقط يحتوي على المفتاح "lines" كقائمة عناصر بهذا الشكل الدقيق:',
      '{"lines":[{"i":"معرف السطر","p":"point_up|book|heart|present|same","s":"icon|same|none","ic":"معرف الرسمة أو فارغ","lbl":"عنوان مختصر للرسمة أو فارغ","acc":true}]}',
    ].join("\n");

    const res = await fetch(CLOUD_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: CLOUD_AI_MODEL,
        reasoning_effort: "low",
        max_tokens: 4000,
        messages: [
          { role: "system", content: "Output strict JSON only with minimal reasoning." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(22000),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        const parsed = JSON.parse(content) as { lines?: AiLineDecision[] };
        if (Array.isArray(parsed.lines) && parsed.lines.length > 0) {
          for (const d of parsed.lines) {
            if (d?.i) aiMap.set(d.i, d);
          }
          usedCloud = aiMap.size > 0;
        }
      }
    }
  } catch {
    // Fallback to local smart semantic engine below
  }

  let prevPose: PoseId | undefined;
  let activeSceneIcon: string | null = null;

  const nextCards = cards.map((c, ci) => ({
    ...c,
    lines: c.lines.map((l, li) => {
      const isVeryFirst = ci === 0 && li === 0;
      const d = aiMap.get(l.id);

      // 1. Pose resolution
      let pose: PoseId | undefined;
      if (d?.p && VALID_POSES.has(d.p)) {
        const candidate = d.p as PoseId;
        pose = !isVeryFirst && candidate === prevPose ? undefined : candidate;
      } else if (d?.p === "same" && !isVeryFirst) {
        pose = undefined;
      } else {
        pose = inferPose(l.text, li === 0, prevPose) ?? (isVeryFirst ? "present" : undefined);
      }
      if (pose) prevPose = pose;
      else if (isVeryFirst) {
        pose = "present";
        prevPose = "present";
      }

      // 2. Scene / Illustration resolution
      let scene: { icon: string; label: string } | undefined;
      const localMatch = matchBestAssetLocally(l.text, assets);

      if (d) {
        if (d.s === "icon" && d.ic && validIconIds.has(d.ic)) {
          // If same icon as activeSceneIcon and no new label, treat as "same" so it doesn't re-pop
          if (!isVeryFirst && d.ic === activeSceneIcon && !d.lbl?.trim()) {
            scene = { icon: "same", label: "" };
          } else {
            const rawLbl = d.lbl?.trim() || "";
            scene = { icon: d.ic, label: rawLbl ? vocalizeText(rawLbl) : "" };
            activeSceneIcon = d.ic;
          }
        } else if (d.s === "same" && !isVeryFirst && activeSceneIcon) {
          scene = { icon: "same", label: "" };
        } else if (d.s === "icon" && (!d.ic || !validIconIds.has(d.ic)) && localMatch) {
          scene = { icon: localMatch.asset.id, label: vocalizeText(localMatch.asset.name) };
          activeSceneIcon = localMatch.asset.id;
        } else {
          scene = undefined;
          activeSceneIcon = null;
        }
      } else {
        // Pure local semantic fallback
        if (localMatch && localMatch.score >= 1.5) {
          if (!isVeryFirst && localMatch.asset.id === activeSceneIcon) {
            scene = { icon: "same", label: "" };
          } else {
            scene = { icon: localMatch.asset.id, label: vocalizeText(localMatch.asset.name) };
            activeSceneIcon = localMatch.asset.id;
          }
        } else if (!isVeryFirst && activeSceneIcon && li > 0 && l.text.trim().length < 28) {
          // Short continuation line in the same card keeps previous illustration
          scene = { icon: "same", label: "" };
        } else {
          scene = undefined;
          activeSceneIcon = null;
        }
      }

      const accent = typeof d?.acc === "boolean" ? (d.acc || undefined) : l.accent;

      return {
        ...l,
        pose,
        scene,
        accent,
      };
    }),
  }));

  return { cards: nextCards, source: usedCloud ? "cloud-ai" : "local-smart" };
}
