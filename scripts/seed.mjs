import fs from "node:fs";
import path from "node:path";

const STUDIO = path.resolve(import.meta.dirname, "..");
const WORKSPACE = path.resolve(STUDIO, "..");
const DATA = path.join(STUDIO, "data");
const PROJECTS = path.join(DATA, "projects");
const ASSETS = path.join(DATA, "assets");

fs.mkdirSync(PROJECTS, { recursive: true });
fs.mkdirSync(ASSETS, { recursive: true });

// 1. Seed assets
const SEED_ICONS = {
  icon_book: "كتاب حديث",
  icon_finger_up: "إصبع التوحيد",
  icon_gift_heart: "هدية وقلب",
  icon_heart_glow: "قلب منير",
  icon_hands_receive: "يدان تدعوان",
  icon_all_good: "كل الخير",
};
const seedDir = path.join(STUDIO, "seed", "icons");
const assetsList = [];
for (const f of fs.readdirSync(seedDir)) {
  const id = path.parse(f).name;
  fs.copyFileSync(path.join(seedDir, f), path.join(ASSETS, f));
  assetsList.push({
    id,
    name: SEED_ICONS[id] ?? id,
    file: f,
    createdAt: "2026-11-07T11:00:00.000Z",
  });
}
fs.writeFileSync(path.join(ASSETS, "assets.json"), JSON.stringify(assetsList, null, 1));

// 2. Read env from reel5_design2/env.js
const envRaw = fs.readFileSync(path.join(WORKSPACE, "reel5_design2", "env.js"), "utf8");
const env = JSON.parse(envRaw.replace(/^window\.ENV\s*=\s*/, "").replace(/;\s*$/, ""));

// 3. Build transcript words from the exact word timings in timeline.js
const rawLines = [
  { text: "رَوَاهُ ابْنُ أَبِي شَيْبَةَ فِي «مُصَنَّفِهِ»", ts: [0.23, 0.96, 1.1, 1.32, 2.4, 2.5], end: 3.2 },
  { text: "عَنْ عَبْدِ اللَّهِ بْنِ مَسْعُودٍ", ts: [3.45, 3.66, 3.9, 4.14, 4.32], end: 4.68 },
  { text: "رَضِيَ اللَّهُ عَنْهُ قَالَ:", ts: [4.74, 5.3, 5.54, 6.02], end: 6.22 },
  { text: "«وَالَّذِي لَا إِلَٰهَ غَيْرُهُ،", ts: [6.32, 7.3, 7.56, 7.98], end: 8.5 },
  { text: "مَا أُعْطِيَ عَبْدٌ مُؤْمِنٌ مِنْ شَيْءٍ", ts: [8.62, 8.98, 9.5, 9.9, 10.56, 10.88], end: 11.45 },
  { text: "أَفْضَلَ مِنْ أَنْ يُحْسِنَ بِاللَّهِ ظَنَّهُ،", ts: [11.62, 12.14, 12.38, 12.66, 13.14, 13.8], end: 14.25 },
  { text: "وَالَّذِي لَا إِلَٰهَ غَيْرُهُ،", ts: [14.42, 15.32, 15.48, 15.88], end: 16.45 },
  { text: "لَا يُحْسِنُ عَبْدٌ مُؤْمِنٌ بِاللَّهِ ظَنَّهُ", ts: [16.62, 17.04, 17.48, 17.84, 18.5, 19.16], end: 19.95 },
  { text: "إِلَّا أَعْطَاهُ اللَّهُ ذَٰلِكَ،", ts: [20.23, 20.72, 21.34, 21.64], end: 22.15 },
  { text: "فَإِنَّ كُلَّ الْخَيْرِ بِيَدِهِ»", ts: [22.32, 23.18, 23.52, 24.16], end: 24.85 },
];

const words = [];
for (const ln of rawLines) {
  const toks = ln.text.split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    const s = ln.ts[i];
    const e = i + 1 < toks.length ? ln.ts[i + 1] - 0.02 : ln.end;
    words.push({ w: toks[i], s, e: Math.max(s + 0.08, Math.round(e * 1000) / 1000) });
  }
}

const transcript = {
  status: "done",
  text: rawLines.map(l => l.text).join(" "),
  words,
};

const cards = [
  {
    id: "c1",
    lines: [
      {
        id: "l1",
        text: "رَوَاهُ ابْنُ أَبِي شَيْبَةَ فِي «مُصَنَّفِهِ»",
        start: 0.23,
        end: 3.2,
        accent: true,
        pose: "book",
        scene: { icon: "icon_book", label: "مُصَنَّفُ ابْنِ أَبِي شَيْبَةَ" },
      },
      {
        id: "l2",
        text: "عَنْ عَبْدِ اللَّهِ بْنِ مَسْعُودٍ",
        start: 3.45,
        end: 4.68,
        badge: "عَبْدُ اللَّهِ بْنُ مَسْعُودٍ رَضِيَ اللَّهُ عَنْهُ",
      },
      {
        id: "l3",
        text: "رَضِيَ اللَّهُ عَنْهُ قَالَ:",
        start: 4.74,
        end: 6.22,
        accent: true,
      },
    ],
  },
  {
    id: "c2",
    header: "قَالَ ابْنُ مَسْعُودٍ رَضِيَ اللَّهُ عَنْهُ:",
    lines: [
      {
        id: "l4",
        text: "«وَالَّذِي لَا إِلَٰهَ غَيْرُهُ،",
        start: 6.32,
        end: 8.5,
        pose: "point_up",
        scene: { icon: "icon_finger_up", label: "يُقْسِمُ بِاللَّهِ" },
      },
      {
        id: "l5",
        text: "مَا أُعْطِيَ عَبْدٌ مُؤْمِنٌ مِنْ شَيْءٍ",
        start: 8.62,
        end: 11.45,
        pose: "present",
        scene: { icon: "icon_gift_heart", label: "أَفْضَلُ عَطِيَّةٍ لِلْمُؤْمِنِ" },
      },
      {
        id: "l6",
        text: "أَفْضَلَ مِنْ أَنْ يُحْسِنَ بِاللَّهِ ظَنَّهُ،",
        start: 11.62,
        end: 14.25,
        badge: "حُسْنُ الظَّنِّ بِاللَّهِ",
      },
    ],
  },
  {
    id: "c3",
    header: "قَالَ ابْنُ مَسْعُودٍ رَضِيَ اللَّهُ عَنْهُ:",
    lines: [
      {
        id: "l7",
        text: "وَالَّذِي لَا إِلَٰهَ غَيْرُهُ،",
        start: 14.42,
        end: 16.45,
        pose: "point_up",
        scene: { icon: "icon_finger_up", label: "يُقْسِمُ مَرَّةً أُخْرَى" },
      },
      {
        id: "l8",
        text: "لَا يُحْسِنُ عَبْدٌ مُؤْمِنٌ بِاللَّهِ ظَنَّهُ",
        start: 16.62,
        end: 19.95,
        pose: "heart",
        scene: { icon: "icon_heart_glow", label: "مَنْ أَحْسَنَ الظَّنَّ بِاللَّهِ" },
      },
    ],
  },
  {
    id: "c4",
    header: "قَالَ ابْنُ مَسْعُودٍ رَضِيَ اللَّهُ عَنْهُ:",
    footer: "— رَوَاهُ ابْنُ أَبِي شَيْبَةَ فِي «المُصَنَّفِ» —",
    lines: [
      {
        id: "l9",
        text: "إِلَّا أَعْطَاهُ اللَّهُ ذَٰلِكَ،",
        start: 20.23,
        end: 22.15,
        pose: "present",
        scene: { icon: "icon_hands_receive", label: "أَعْطَاهُ اللَّهُ ذَٰلِكَ" },
      },
      {
        id: "l10",
        text: "فَإِنَّ كُلَّ الْخَيْرِ بِيَدِهِ»",
        start: 22.32,
        end: 24.75,
        scene: { icon: "icon_all_good", label: "كُلُّ الْخَيْرِ بِيَدِ اللَّهِ" },
      },
    ],
  },
];

function seedProject({ id, title, template, timing, mp4Source, updatedAt }) {
  const dir = path.join(PROJECTS, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(WORKSPACE, "5حديث.ogg"), path.join(dir, "voice.ogg"));
  const mp4Path = path.join(WORKSPACE, mp4Source);
  const hasMp4 = fs.existsSync(mp4Path);
  if (hasMp4) {
    fs.copyFileSync(mp4Path, path.join(dir, "video.mp4"));
  }

  const project = {
    id,
    title,
    template,
    channelName: "عَرَفْتَ فَالْزَمْ",
    createdAt: "2026-11-07T11:30:00.000Z",
    updatedAt,
    audio: {
      file: "voice.ogg",
      originalName: "5حديث.ogg",
      duration: 25.41,
    },
    timing,
    cards,
  };

  fs.writeFileSync(path.join(dir, "project.json"), JSON.stringify(project, null, 1));
  fs.writeFileSync(path.join(dir, "transcript.json"), JSON.stringify(transcript, null, 1));
  fs.writeFileSync(path.join(dir, "env.json"), JSON.stringify(env));
  fs.writeFileSync(
    path.join(dir, "render.json"),
    JSON.stringify(
      hasMp4
        ? { status: "done", progress: 1, output: "video.mp4", finishedAt: updatedAt }
        : { status: "idle", progress: 0 },
      null,
      1
    )
  );
}

seedProject({
  id: "hadith5-kids",
  title: "حديث 5 — حسن الظن بالله (التصميم 2 الكرتوني)",
  template: "kids",
  timing: { intro: 3.5, hold: 1.0, fade: 1.8 },
  mp4Source: "حديث5_تصميم (2).mp4",
  updatedAt: "2026-11-07T15:30:00.000Z",
});

seedProject({
  id: "hadith5-library",
  title: "حديث 5 — حسن الظن بالله (التصميم 1 المكتبة)",
  template: "library",
  timing: { intro: 3.0, hold: 1.0, fade: 1.34 },
  mp4Source: "حديث5_تصميم (1).mp4",
  updatedAt: "2026-11-07T15:00:00.000Z",
});

console.log("Seeded projects and assets successfully.");
