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
 * Semantic fallback matcher: scores a piece of Arabic text against all available library assets
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
 * Uses Free Cloud AI + Pacing Guardrails to organize character hand poses and illustrations
 * in a calm, human-paced way (never switching icons or poses every single line!).
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

    const cardStructure = cards.map((c, ci) => ({
      cardNumber: ci + 1,
      lines: c.lines.map(l => ({
        i: l.id,
        durationSec: Math.round((l.end - l.start) * 10) / 10,
        text: l.text,
      })),
    }));

    const prompt = [
      "أنت مخرج فني محترف وهادئ لمقاطع الريلز الإسلامية والتربوية.",
      "قاعدة إخراجية ذهبية ومهمة جداً: يمنع منعاً باتاً تغيير الرسمة أو حركة اليد في كل سطر لأن ذلك يشتت المشاهد ويجعل الفيديو مزدحماً وسريعاً بشكل مزعج!",
      "",
      "التزم بقواعد الإيقاع الهادئ التالية:",
      "1. الشريحة الواحدة (card) تحتوي على عدة أسطر مترابطة في المعنى: اختر رسمة واحدة فقط في بداية الفكرة (s: 'icon')، ثم في الأسطر التالية المكملة لنفس الجملة أو الآية اجعلها حتماً (s: 'same') لتبقى الرسمة ثابتة على الشاشة لمدة كافية (4 إلى 6 ثوانٍ).",
      "2. لا تضع رسمة في كل شريحة بالقوة؛ إذا كانت الجملة تمهيدية أو لا تطابق أي رسمة بوضوح فاجعلها بدون رسمة (s: 'none'). في الفيديو الكامل يكفي ظهور 2 إلى 4 رسومات فقط في اللحظات المؤثرة.",
      "3. حركة اليد (p): لا تغير حركة اليد في كل سطر! اختر حركة يد في بداية الشريحة أو المعنى، واجعل الأسطر التي تليها (p: 'same') حتى ينتقل الكلام لمعنى جديد تماماً.",
      "4. التمييز اللوني (acc): اجعله true فقط في سطر واحد أو سطرين على الأكثر في الفيديو كله (خاتمة الحديث أو موضع الشاهد الرئيسي)، والباقي false.",
      "",
      "حركات اليد المتاحة (p):",
      "- point_up: يشير لأعلى (عند ذكر الله تعالى، قال الله، القسم بالله)",
      "- book: يمسك كتاباً (عند ذكر الراوي، رواه، مصنف، الطبري، في تفسيرها)",
      "- heart: يده على قلبه (عند ذكر المحبة، الإحسان، يحب المحسنين، حسن الظن بالله)",
      "- present: يشرح بيده (للشرح العام والعطاء)",
      "- same: استمرار نفس حركة اليد السابقة (استخدمها في أغلب الأسطر المتتالية)",
      "",
      "قائمة الرسومات المتاحة في المكتبة (اختر فقط من هذه الـ id عند وجود تطابق قوي):",
      JSON.stringify(iconCatalog),
      "",
      "شرائح وأسطر الفيديو:",
      JSON.stringify(cardStructure),
      "",
      'أرجع JSON فقط يحتوي على المفتاح "lines" لكل الأسطر بالترتيب:',
      '{"lines":[{"i":"معرف السطر","p":"point_up|book|heart|present|same","s":"icon|same|none","ic":"معرف الرسمة أو فارغ","lbl":"عنوان مختصر للرسمة أو فارغ","acc":false}]}',
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
          { role: "system", content: "Output strict JSON only with minimal reasoning. Follow calm pacing rules strictly." },
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

  // Post-processing with strict Pacing & Cooldown Guardrails so it NEVER changes every line
  const MIN_SCENE_HOLD_SEC = 4.2; // An illustration must stay at least ~4.2s (or across its card) before switching to another icon
  const MIN_POSE_HOLD_SEC = 3.6;  // Character hand pose must stay at least ~3.6s before switching

  let prevPose: PoseId | undefined;
  let lastPoseChangeStart = -99;
  let activeSceneIcon: string | null = null;
  let lastSceneStart = -99;
  let lastSceneCardIdx = -1;
  let totalAccents = 0;

  const nextCards = cards.map((c, ci) => {
    // Also score the whole card text for local fallback so we pick at most 1 best icon per card
    const cardText = c.lines.map(l => l.text).join(" ");
    const cardMatch = matchBestAssetLocally(cardText, assets);
    let cardHasAccent = false;

    return {
      ...c,
      lines: c.lines.map((l, li) => {
        const isVeryFirst = ci === 0 && li === 0;
        const d = aiMap.get(l.id);
        const timeSincePoseChange = l.start - lastPoseChangeStart;
        const timeSinceSceneStart = l.start - lastSceneStart;

        // 1. Calm Pose Resolution
        let pose: PoseId | undefined;
        let desiredPose: PoseId | undefined;
        if (d?.p && VALID_POSES.has(d.p)) {
          desiredPose = d.p as PoseId;
        } else if (!d || d.p !== "same") {
          desiredPose = inferPose(l.text, li === 0, prevPose);
        }

        if (isVeryFirst) {
          pose = desiredPose ?? "present";
          prevPose = pose;
          lastPoseChangeStart = l.start;
        } else if (
          desiredPose &&
          desiredPose !== prevPose &&
          (li === 0 || timeSincePoseChange >= MIN_POSE_HOLD_SEC)
        ) {
          pose = desiredPose;
          prevPose = pose;
          lastPoseChangeStart = l.start;
        } else {
          // Keep same pose ("نفس السابقة") to avoid rapid hand switching
          pose = undefined;
        }

        // 2. Calm Scene / Illustration Resolution
        let scene: { icon: string; label: string } | undefined;

        if (usedCloud && d) {
          const wantsNewIcon = d.s === "icon" && d.ic && validIconIds.has(d.ic);
          const wantsSame = d.s === "same";

          if (wantsNewIcon) {
            const candidateIcon = d.ic!;
            // Guardrail: If an icon is already active in this SAME card or started < MIN_SCENE_HOLD_SEC ago,
            // don't switch to a different icon mid-card — keep the current icon ("same") smoothly!
            if (
              activeSceneIcon &&
              (ci === lastSceneCardIdx || timeSinceSceneStart < MIN_SCENE_HOLD_SEC || candidateIcon === activeSceneIcon)
            ) {
              scene = { icon: "same", label: "" };
            } else {
              const rawLbl = d.lbl?.trim() || "";
              scene = { icon: candidateIcon, label: rawLbl ? vocalizeText(rawLbl) : "" };
              activeSceneIcon = candidateIcon;
              lastSceneStart = l.start;
              lastSceneCardIdx = ci;
            }
          } else if (wantsSame && activeSceneIcon) {
            scene = { icon: "same", label: "" };
          } else {
            // d.s === "none":
            // Guardrail: If an icon just started on the previous line in the SAME card (< 3.5s ago),
            // don't flash it and hide it mid-card — keep it for this line in the card!
            if (activeSceneIcon && ci === lastSceneCardIdx && timeSinceSceneStart < 3.5) {
              scene = { icon: "same", label: "" };
            } else {
              scene = undefined;
              activeSceneIcon = null;
            }
          }
        } else {
          // Local Smart Fallback: at most 1 icon per card, held across the card's lines
          if (li === 0 && cardMatch && cardMatch.score >= 2) {
            if (cardMatch.asset.id === activeSceneIcon) {
              scene = { icon: "same", label: "" };
            } else {
              scene = { icon: cardMatch.asset.id, label: vocalizeText(cardMatch.asset.name) };
              activeSceneIcon = cardMatch.asset.id;
              lastSceneStart = l.start;
              lastSceneCardIdx = ci;
            }
          } else if (li > 0 && activeSceneIcon && ci === lastSceneCardIdx) {
            scene = { icon: "same", label: "" };
          } else {
            scene = undefined;
            activeSceneIcon = null;
          }
        }

        // 3. Calm Accent Resolution (at most 1 per card, max 2 in video)
        let accent: boolean | undefined;
        if (d?.acc === true && !cardHasAccent && totalAccents < 2) {
          accent = true;
          cardHasAccent = true;
          totalAccents++;
        } else {
          accent = undefined;
        }

        return {
          ...l,
          pose,
          scene,
          accent,
        };
      }),
    };
  });

  return { cards: nextCards, source: usedCloud ? "cloud-ai" : "local-smart" };
}
