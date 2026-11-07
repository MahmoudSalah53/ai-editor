"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  Clock,
  Crosshair,
  Feather,
  Hand,
  ImageIcon,
  Merge,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Sparkles,
  Star,
  Trash2,
  Ban,
} from "lucide-react";
import type { Card, Line, PoseId, TemplateId, TimedWord } from "@/lib/types";
import { POSES } from "@/lib/types";
import { autoAssignPoses, realignCards, uid, vocalizeCards } from "@/lib/compile";
import { hasTashkeel, vocalizeText } from "@/lib/tashkeel";
import { Button, EmptyState, Input, api, cx } from "@/components/ui";
import { IconPicker, type AssetItem } from "./IconPicker";

const r2 = (n: number) => Math.round(n * 100) / 100;

const POSE_THUMBS: Record<PoseId, string> = {
  present: "/templates/kids/char_present.png",
  point_up: "/templates/kids/char_point_up.png",
  book: "/templates/kids/char_book.png",
  heart: "/templates/kids/char_heart.png",
};

const HARAKAT: Array<{ char: string; label: string; display: string }> = [
  { char: "\u064E", label: "فتحة", display: "ـَ" },
  { char: "\u064F", label: "ضمة", display: "ـُ" },
  { char: "\u0650", label: "كسرة", display: "ـِ" },
  { char: "\u0651", label: "شدة", display: "ـّ" },
  { char: "\u0652", label: "سكون", display: "ـْ" },
  { char: "\u064B", label: "تنوين فتح", display: "ـً" },
  { char: "\u064C", label: "تنوين ضم", display: "ـٌ" },
  { char: "\u064D", label: "تنوين كسر", display: "ـٍ" },
  { char: "\u0670", label: "ألف خنجرية", display: "ـٰ" },
];

interface Props {
  projectId: string;
  cards: Card[];
  words: TimedWord[];
  audioDuration: number;
  template: TemplateId;
  assets: AssetItem[];
  activeLineId: string | null;
  onChange: (cards: Card[]) => void;
  onAssets: (a: AssetItem[]) => void;
  onReplaceAssets: (a: AssetItem[]) => void;
  playAt: (voiceTime: number) => void;
  voiceTime: () => number;
  goToText: () => void;
}

export function CardsTab({ projectId, cards, words, audioDuration, template, assets, activeLineId, onChange, onAssets, onReplaceAssets, playAt, voiceTime, goToText }: Props) {
  const [picker, setPicker] = useState<{ ci: number; li: number } | null>(null);
  const [showHarakat, setShowHarakat] = useState(false);
  const [aiDirecting, setAiDirecting] = useState(false);
  const [aiDoneMsg, setAiDoneMsg] = useState<string | null>(null);
  const lastFocusedInput = useRef<{ el: HTMLInputElement; ci: number; li: number } | null>(null);

  async function runAiDirector() {
    setAiDirecting(true);
    setAiDoneMsg(null);
    try {
      const res = await api<{ cards: Card[]; assets: AssetItem[]; source: string }>(`/api/projects/${projectId}/ai-direct`, {
        method: "POST",
        body: JSON.stringify({ cards }),
      });
      if (res.assets?.length) onReplaceAssets(res.assets);
      if (res.cards?.length) onChange(res.cards);
      setAiDoneMsg("تم توزيع الرسومات وحركات اليد بالـ AI بنجاح!");
      setTimeout(() => setAiDoneMsg(null), 4000);
    } catch {
      // Fallback to local pose assignment if request fails
      onChange(autoAssignPoses(cards));
    } finally {
      setAiDirecting(false);
    }
  }

  const setCard = (ci: number, patch: Partial<Card>) => onChange(cards.map((c, i) => (i === ci ? { ...c, ...patch } : c)));
  const setLine = (ci: number, li: number, patch: Partial<Line>) => {
    const next = cards.map((c, i) => (i === ci ? { ...c, lines: c.lines.map((l, j) => (j === li ? { ...l, ...patch } : l)) } : c));
    onChange(patch.text !== undefined ? realignCards(next, words, audioDuration) : next);
  };

  function removeLine(ci: number, li: number) {
    const next = cards.map((c, i) => (i === ci ? { ...c, lines: c.lines.filter((_, j) => j !== li) } : c)).filter(c => c.lines.length);
    onChange(realignCards(next, words, audioDuration));
  }
  function addLine(ci: number) {
    const c = cards[ci];
    const last = c.lines[c.lines.length - 1];
    const start = last ? r2(last.end) : 0;
    setCard(ci, { lines: [...c.lines, { id: uid(), text: "", start, end: r2(start + 1.5) }] });
  }
  function splitAt(ci: number, li: number) {
    const c = cards[ci];
    const a: Card = { ...c, lines: c.lines.slice(0, li), footer: undefined };
    const b: Card = { id: uid(), header: c.header, footer: c.footer, lines: c.lines.slice(li) };
    onChange([...cards.slice(0, ci), a, b, ...cards.slice(ci + 1)]);
  }
  function mergeNext(ci: number) {
    const a = cards[ci], b = cards[ci + 1];
    if (!b) return;
    onChange([...cards.slice(0, ci), { ...a, lines: [...a.lines, ...b.lines], footer: b.footer ?? a.footer }, ...cards.slice(ci + 2)]);
  }
  function applyHeaderToNext(ci: number) {
    const h = cards[ci].header;
    onChange(cards.map((c, i) => (i > ci ? { ...c, header: h } : c)));
  }

  function insertHaraka(ch: string) {
    const ref = lastFocusedInput.current;
    if (!ref) return;
    const { el, ci, li } = ref;
    const line = cards[ci]?.lines[li];
    if (!line) return;
    const pos = el.selectionStart ?? line.text.length;
    const nextText = line.text.slice(0, pos) + ch + line.text.slice(el.selectionEnd ?? pos);
    setLine(ci, li, { text: nextText });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos + ch.length, pos + ch.length);
    });
  }

  if (!cards.length) {
    return (
      <EmptyState
        icon={<ImageIcon className="size-5" />}
        title="لا توجد ترجمة بعد"
        text="ابدأ من تبويب «النص»: الصق النص المشكَّل واضغط مزامنة، أو استخدم التقسيم التلقائي."
        action={<Button variant="primary" onClick={goToText}>الذهاب للنص</Button>}
      />
    );
  }

  const kids = template === "kids";

  // Precompute inherited pose and inherited scene icon for each (ci, li) so "نفس السابقة" shows what is actually active
  let runningPose: PoseId = "present";
  let runningSceneIcon: string | null = null;
  const lineInherited: Record<string, { pose: PoseId; prevSceneIcon: string | null }> = {};
  for (const c of cards) {
    for (const l of c.lines) {
      lineInherited[l.id] = { pose: runningPose, prevSceneIcon: runningSceneIcon };
      if (l.pose) runningPose = l.pose;
      const ic = l.scene?.icon?.trim();
      if (ic && ic !== "same") runningSceneIcon = ic;
      else if (ic === "same") {
        // keeps runningSceneIcon
      } else {
        runningSceneIcon = null;
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Clean, friendly top bar */}
      <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {kids && (
              <Button
                size="sm"
                variant="primary"
                loading={aiDirecting}
                onClick={runAiDirector}
                title="يقرأ الذكاء الاصطناعي نص كل سطر ويختار أنسب رسمة توضيحية من مكتبتك (أو نفس السابقة أو بدون رسمة) مع حركة اليد المناسبة تلقائياً"
              >
                <Sparkles className="size-3.5" />
                {aiDirecting ? "جارٍ التوزيع الذكي بالـ AI…" : "تنظيم الرسومات والحركات بالـ AI"}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onChange(vocalizeCards(cards))}
              title="تشكيل الكلمات التي لا تحتوي على تشكيل تلقائياً"
            >
              <Feather className="size-3.5 text-accent" />
              تشكيل تلقائي
            </Button>
            {words.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onChange(realignCards(cards, words, audioDuration))}
                title="إعادة ربط بداية ونهاية كل سطر وكل كلمة بتوقيت نطقها في الصوت"
              >
                <RefreshCw className="size-3.5 text-accent" />
                ضبط التوقيت مع الصوت
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowHarakat(v => !v)}
            className={cx(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
              showHarakat
                ? "border-accent bg-accent-soft text-accent"
                : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100"
            )}
          >
            <span>لوحة التشكيل اليدوي</span>
            <ChevronDown className={cx("size-3.5 transition-transform", showHarakat && "rotate-180")} />
          </button>
        </div>

        {aiDoneMsg && (
          <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
            <Sparkles className="size-3.5 text-emerald-600" />
            <span>{aiDoneMsg}</span>
          </div>
        )}

        {showHarakat && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-stone-100 pt-2.5">
            <span className="me-1 text-xs text-stone-500">ضع المؤشر بعد الحرف في أي سطر ثم اضغط الحركة:</span>
            {HARAKAT.map(h => (
              <button
                key={h.char}
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  insertHaraka(h.char);
                }}
                title={h.label}
                className="arabic-text flex h-8 items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 text-sm font-bold text-stone-700 transition hover:border-accent hover:bg-accent-soft hover:text-accent"
              >
                <span>{h.display}</span>
                <span className="font-sans text-[10px] font-normal text-stone-400">{h.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cards list */}
      {cards.map((c, ci) => (
        <div key={c.id} className="overflow-visible rounded-xl border border-stone-200 bg-white shadow-2xs">
          {/* Card Header */}
          <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50/60 px-3.5 py-2">
            <span className="shrink-0 rounded-md bg-stone-200/80 px-2 py-0.5 text-xs font-semibold text-stone-700">
              شريحة {ci + 1}
            </span>
            <Input
              value={c.header ?? ""}
              onChange={e => setCard(ci, { header: e.target.value })}
              placeholder="عنوان ثابت أعلى الشريحة (اختياري) — مثال: قَالَ اللَّهُ تَعَالَى:"
              className="h-8 border-transparent bg-transparent px-2 text-sm font-medium text-amber-800 placeholder:font-normal placeholder:text-stone-400 focus:border-stone-200 focus:bg-white"
            />
            <CardMenu
              canMerge={ci < cards.length - 1}
              hasHeader={!!c.header}
              onMerge={() => mergeNext(ci)}
              onHeaderToNext={() => applyHeaderToNext(ci)}
              onDelete={() => onChange(cards.filter((_, i) => i !== ci))}
            />
          </div>

          {/* Subtitle Lines inside Card */}
          <ul className="divide-y divide-stone-100">
            {c.lines.map((l, li) => (
              <LineRow
                key={l.id}
                line={l}
                isFirstLine={ci === 0 && li === 0}
                inheritedPose={lineInherited[l.id]?.pose ?? "present"}
                inheritedSceneIcon={lineInherited[l.id]?.prevSceneIcon ?? null}
                active={l.id === activeLineId}
                kids={kids}
                assets={assets}
                canSplit={li > 0}
                onFocusInput={el => { lastFocusedInput.current = { el, ci, li }; }}
                onChange={patch => setLine(ci, li, patch)}
                onRemove={() => removeLine(ci, li)}
                onSplit={() => splitAt(ci, li)}
                onPlay={() => playAt(l.start)}
                onSetStart={() => { const t = r2(voiceTime()); setLine(ci, li, { start: t, end: Math.max(l.end, r2(t + 0.3)) }); }}
                onPickIcon={() => setPicker({ ci, li })}
              />
            ))}
          </ul>

          {/* Card Footer */}
          <div className="flex items-center gap-2 border-t border-stone-100 bg-stone-50/40 px-3 py-1.5">
            <Button size="sm" variant="ghost" onClick={() => addLine(ci)} className="text-xs text-stone-600">
              <Plus className="size-3.5" />
              إضافة سطر للشريحة
            </Button>
            <div className="h-3.5 w-px bg-stone-200" />
            <Input
              value={c.footer ?? ""}
              onChange={e => setCard(ci, { footer: e.target.value })}
              placeholder="المصدر أسفل الشريحة (اختياري) — مثال: — رَوَاهُ الطَّبَرِيُّ —"
              className="h-7 border-transparent bg-transparent px-2 text-xs text-stone-600 placeholder:text-stone-400 focus:border-stone-200 focus:bg-white"
            />
          </div>
        </div>
      ))}

      <IconPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        assets={assets}
        value={picker ? cards[picker.ci]?.lines[picker.li]?.scene?.icon : undefined}
        onPick={id => {
          if (!picker) return;
          const l = cards[picker.ci].lines[picker.li];
          setLine(picker.ci, picker.li, { scene: { icon: id, label: l.scene?.icon === "same" ? "" : (l.scene?.label ?? "") } });
        }}
        onUploaded={a => onAssets(a)}
      />
    </div>
  );
}

function CardMenu({ canMerge, hasHeader, onMerge, onHeaderToNext, onDelete }: { canMerge: boolean; hasHeader: boolean; onMerge: () => void; onHeaderToNext: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2 px-3 py-2 text-start text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:text-stone-300 disabled:hover:bg-transparent";
  return (
    <div className="relative">
      <Button size="icon" variant="ghost" onClick={() => setOpen(o => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} aria-label="خيارات الشريحة" title="خيارات الشريحة">
        <MoreHorizontal className="size-4" />
      </Button>
      {open ? (
        <div className="absolute end-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          <button className={item} disabled={!canMerge} onClick={onMerge}><Merge className="size-4" />دمج مع الشريحة التالية</button>
          <button className={item} disabled={!hasHeader || !canMerge} onClick={onHeaderToNext}><ArrowDownToLine className="size-4" />تطبيق العنوان على الشرائح التالية</button>
          <button className={cx(item, "text-red-600 hover:bg-red-50")} onClick={onDelete}><Trash2 className="size-4" />حذف الشريحة بالكامل</button>
        </div>
      ) : null}
    </div>
  );
}

const LineRow = memo(function LineRow({
  line,
  isFirstLine,
  inheritedPose,
  inheritedSceneIcon,
  active,
  kids,
  assets,
  canSplit,
  onFocusInput,
  onChange,
  onRemove,
  onSplit,
  onPlay,
  onSetStart,
  onPickIcon,
}: {
  line: Line;
  isFirstLine: boolean;
  inheritedPose: PoseId;
  inheritedSceneIcon: string | null;
  active: boolean;
  kids: boolean;
  assets: AssetItem[];
  canSplit: boolean;
  onFocusInput: (el: HTMLInputElement) => void;
  onChange: (p: Partial<Line>) => void;
  onRemove: () => void;
  onSplit: () => void;
  onPlay: () => void;
  onSetStart: () => void;
  onPickIcon: () => void;
}) {
  const [openPanel, setOpenPanel] = useState<"scene" | "pose" | "time" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!openPanel && !menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [openPanel, menuOpen]);

  const isSameScene = line.scene?.icon === "same";
  const hasCustomScene = !!(line.scene?.icon && line.scene.icon !== "same");
  const customIcon = hasCustomScene ? assets.find(a => a.id === line.scene!.icon) : undefined;
  const inheritedIcon = inheritedSceneIcon ? assets.find(a => a.id === inheritedSceneIcon) : undefined;

  const effectivePoseId: PoseId = line.pose ?? inheritedPose;
  const effectivePoseObj = POSES.find(p => p.id === effectivePoseId) ?? POSES[0];

  const hasUnvocalized = line.text.trim().split(/\s+/).some(w => /[\p{L}]/u.test(w) && !hasTashkeel(w));

  return (
    <li ref={rowRef} className={cx(" px-3.5 py-2.5 transition-colors", active ? "bg-accent-soft/60" : "hover:bg-stone-50/40")}>
      {/* Single clean horizontal row */}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        {/* Play button */}
        <button
          type="button"
          onClick={onPlay}
          title="تشغيل الفيديو من بداية هذا السطر"
          className={cx(
            "grid size-8 shrink-0 place-items-center rounded-full transition",
            active ? "bg-accent text-white shadow-xs" : "bg-stone-100 text-stone-600 hover:bg-accent hover:text-white"
          )}
          aria-label="تشغيل من هذا السطر"
        >
          <Play className="size-3.5" />
        </button>

        {/* Subtitle Text Input */}
        <div className="relative min-w-[200px] flex-1">
          <Input
            value={line.text}
            onFocus={e => onFocusInput(e.currentTarget)}
            onChange={e => onChange({ text: e.target.value })}
            dir="rtl"
            className={cx(
              "arabic-text h-10 w-full pe-9 text-[16px]",
              line.accent && "border-amber-300 bg-amber-50/40 text-amber-800"
            )}
            placeholder="اكتب نص السطر هنا…"
          />
          <button
            type="button"
            onClick={() => onChange({ accent: !line.accent || undefined })}
            title={line.accent ? "إلغاء تمييز السطر" : "تمييز السطر بلون مميز في الفيديو"}
            className={cx(
              "absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 transition",
              line.accent ? "text-amber-500 hover:bg-amber-100" : "text-stone-300 hover:bg-stone-100 hover:text-stone-500"
            )}
          >
            <Star className={cx("size-4", line.accent && "fill-amber-400")} />
          </button>
        </div>

        {/* Auto-tashkeel quick button if line has unvocalized word */}
        {hasUnvocalized && (
          <button
            type="button"
            onClick={() => onChange({ text: vocalizeText(line.text) })}
            title="تشكيل الكلمات غير المشكولة في هذا السطر"
            className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
          >
            <Feather className="size-3.5" />
            <span>تشكيل</span>
          </button>
        )}

        {/* Kids Template Pill 1: Illustration / Emoji */}
        {kids && (
          <button
            type="button"
            onClick={() => setOpenPanel(p => (p === "scene" ? null : "scene"))}
            title="اختيار الرسمة التوضيحية لهذا السطر"
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition",
              openPanel === "scene"
                ? "border-accent bg-accent/10 font-semibold text-accent ring-2 ring-accent/20"
                : hasCustomScene
                ? "border-emerald-300 bg-emerald-50/70 font-medium text-emerald-900 hover:bg-emerald-50"
                : isSameScene
                ? "border-sky-200 bg-sky-50/70 font-medium text-sky-800 hover:bg-sky-50"
                : "border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:bg-stone-100"
            )}
          >
            {hasCustomScene && customIcon ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={customIcon.url} alt="" className="size-5 rounded bg-[#FFF3DC] object-contain mix-blend-multiply" />
                <span className="max-w-[95px] truncate">{customIcon.name}</span>
              </>
            ) : isSameScene ? (
              <>
                {inheritedIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={inheritedIcon.url} alt="" className="size-5 rounded bg-[#FFF3DC] object-contain opacity-75 mix-blend-multiply" />
                ) : (
                  <RotateCcw className="size-3.5 text-sky-600" />
                )}
                <span>نفس السابقة</span>
              </>
            ) : (
              <>
                <ImageIcon className="size-3.5 text-stone-400" />
                <span>بدون رسمة</span>
              </>
            )}
            <ChevronDown className={cx("size-3 opacity-60 transition-transform", openPanel === "scene" && "rotate-180")} />
          </button>
        )}

        {/* Kids Template Pill 2: Character Hand Gesture */}
        {kids && (
          <button
            type="button"
            onClick={() => setOpenPanel(p => (p === "pose" ? null : "pose"))}
            title="تغيير حركة يد الشخصية في هذا السطر"
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs transition",
              openPanel === "pose"
                ? "border-accent bg-accent/10 font-semibold text-accent ring-2 ring-accent/20"
                : line.pose
                ? "border-stone-300 bg-white font-medium text-stone-800 hover:bg-stone-50"
                : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:bg-stone-100"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={POSE_THUMBS[effectivePoseId]} alt="" className="size-5 rounded bg-[#FFF3DC] object-contain" />
            <span>{line.pose ? effectivePoseObj.name : `نفس السابقة (${effectivePoseObj.name})`}</span>
            <ChevronDown className={cx("size-3 opacity-60 transition-transform", openPanel === "pose" && "rotate-180")} />
          </button>
        )}

        {/* Compact Time Badge (click to edit start/end seconds) */}
        <button
          type="button"
          onClick={() => setOpenPanel(p => (p === "time" ? null : "time"))}
          title="اضغط لتعديل وقت بداية ونهاية السطر"
          dir="ltr"
          className={cx(
            "flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] tabular-nums transition",
            openPanel === "time"
              ? "border-accent bg-accent-soft font-semibold text-accent"
              : "border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:text-stone-700"
          )}
        >
          <Clock className="size-3" />
          <span>{line.start.toFixed(1)}s</span>
        </button>

        {/* Line Options Menu (Split / Delete) */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            title="خيارات السطر"
            className="grid size-8 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div className="absolute end-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 text-xs shadow-lg">
              <button
                type="button"
                onClick={() => { onChange({ accent: !line.accent || undefined }); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-stone-700 hover:bg-stone-50"
              >
                <Star className={cx("size-3.5", line.accent && "fill-amber-400 text-amber-500")} />
                <span>{line.accent ? "إلغاء تمييز السطر" : "تمييز السطر بلون مميز"}</span>
              </button>
              <button
                type="button"
                onClick={() => { setOpenPanel("time"); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-stone-700 hover:bg-stone-50"
              >
                <Clock className="size-3.5" />
                <span>تعديل توقيت البداية والنهاية</span>
              </button>
              {canSplit && (
                <button
                  type="button"
                  onClick={() => { onSplit(); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-start text-stone-700 hover:bg-stone-50"
                >
                  <Scissors className="size-3.5" />
                  <span>فصل في شريحة جديدة من هنا</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => { onRemove(); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-red-600 hover:bg-red-50"
              >
                <Trash2 className="size-3.5" />
                <span>حذف هذا السطر</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expandable Panel 1: Illustration / Emoji Picker (Only visible when clicked!) */}
      {kids && openPanel === "scene" && (
        <div className="mt-2.5 rounded-xl border border-stone-200 bg-stone-50/90 p-3 shadow-inner">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-700">اختر حالة الرسمة التوضيحية في هذا السطر:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => { onChange({ scene: undefined, badge: undefined }); setOpenPanel(null); }}
                className={cx(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  !line.scene?.icon
                    ? "border-accent bg-accent text-white shadow-2xs"
                    : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                )}
              >
                <Ban className="size-3.5" />
                <span>بدون رسمة (إخفاء)</span>
              </button>
              {!isFirstLine && (
                <button
                  type="button"
                  onClick={() => { onChange({ scene: { icon: "same", label: "" } }); setOpenPanel(null); }}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                    isSameScene
                      ? "border-accent bg-accent text-white shadow-2xs"
                      : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                  )}
                >
                  <RotateCcw className="size-3.5" />
                  <span>نفس الرسمة السابقة</span>
                </button>
              )}
              <button
                type="button"
                onClick={onPickIcon}
                className="flex items-center gap-1 rounded-lg border border-dashed border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-accent transition hover:border-accent hover:bg-accent-soft"
              >
                <Plus className="size-3.5" />
                <span>رفع رسمة جديدة…</span>
              </button>
            </div>
          </div>

          {/* Visual grid of available illustrations */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {assets.map(a => {
              const selected = line.scene?.icon === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onChange({ scene: { icon: a.id, label: isSameScene ? "" : (line.scene?.label ?? "") } })}
                  className={cx(
                    "flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition",
                    selected
                      ? "border-accent bg-accent-soft/80 font-semibold text-accent ring-2 ring-accent/30"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-100"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="size-11 rounded-lg bg-[#FFF3DC] object-contain p-1 mix-blend-multiply" />
                  <span className="w-full truncate text-[11px]">{a.name}</span>
                </button>
              );
            })}
          </div>

          {/* Optional title & badge inputs when an illustration is active */}
          {(hasCustomScene || isSameScene) && (
            <div className="mt-2.5 grid grid-cols-1 gap-2 border-t border-stone-200/80 pt-2.5 sm:grid-cols-2">
              {hasCustomScene && (
                <Input
                  value={line.scene?.label ?? ""}
                  onChange={e => onChange({ scene: { icon: line.scene?.icon ?? "", label: e.target.value } })}
                  placeholder="عنوان يظهر تحت الرسمة (اختياري)"
                  className="h-8 bg-white text-xs"
                />
              )}
              <Input
                value={line.badge ?? ""}
                onChange={e => onChange({ badge: e.target.value || undefined })}
                placeholder="شارة فرعية صغيرة تحت العنوان (اختياري)"
                className="h-8 bg-white text-xs"
              />
            </div>
          )}
        </div>
      )}

      {/* Expandable Panel 2: Character Hand Gesture Picker (Only visible when clicked!) */}
      {kids && openPanel === "pose" && (
        <div className="mt-2.5 rounded-xl border border-stone-200 bg-stone-50/90 p-3 shadow-inner">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-700">اختر حركة يد الشخصية في هذا السطر:</span>
            {!isFirstLine && (
              <button
                type="button"
                onClick={() => { onChange({ pose: undefined }); setOpenPanel(null); }}
                className={cx(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition",
                  !line.pose
                    ? "border-accent bg-accent text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                )}
              >
                <RotateCcw className="size-3.5" />
                <span>نفس الحركة السابقة ({POSES.find(p => p.id === inheritedPose)?.name})</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POSES.map(p => {
              const selected = line.pose === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange({ pose: p.id }); setOpenPanel(null); }}
                  className={cx(
                    "flex items-center gap-2 rounded-xl border p-2 text-start transition",
                    selected
                      ? "border-accent bg-accent-soft/80 font-semibold text-accent ring-2 ring-accent/30"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-100"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={POSE_THUMBS[p.id]} alt="" className="size-10 shrink-0 rounded-lg bg-[#FFF3DC] object-contain" />
                  <span className="text-xs">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable Panel 3: Precision Time Adjuster (Only visible when clicked!) */}
      {openPanel === "time" && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-stone-50/90 px-3 py-2 text-xs text-stone-600 shadow-inner">
          <span className="font-semibold text-stone-700">توقيت السطر (بالثواني):</span>
          <TimeField label="يبدأ عند" value={line.start} onChange={v => onChange({ start: v, end: Math.max(line.end, r2(v + 0.2)) })} />
          <TimeField label="ينتهي عند" value={line.end} onChange={v => onChange({ end: Math.max(r2(line.start + 0.2), v) })} />
          <button
            type="button"
            onClick={onSetStart}
            className="flex items-center gap-1 rounded-lg border border-accent/30 bg-white px-2.5 py-1 font-medium text-accent transition hover:bg-accent-soft"
          >
            <Crosshair className="size-3.5" />
            <span>اجعل البداية عند موضع الصوت الحالي</span>
          </button>
        </div>
      )}
    </li>
  );
});

function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1.5">
      <span>{label}</span>
      <input
        type="number"
        step={0.05}
        min={0}
        dir="ltr"
        value={draft ?? value.toFixed(2)}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== null) { const v = parseFloat(draft); if (isFinite(v)) onChange(r2(Math.max(0, v))); setDraft(null); } }}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onChange(r2(Math.max(0, value + (e.key === "ArrowUp" ? 0.05 : -0.05)))); setDraft(null); }
        }}
        className="h-7 w-16 rounded-md border border-stone-200 bg-white px-1.5 text-center text-xs text-stone-700 tabular-nums focus:border-accent focus:outline-none"
      />
    </label>
  );
}
