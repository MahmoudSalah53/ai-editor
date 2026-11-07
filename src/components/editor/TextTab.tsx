"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { AlertCircle, Feather, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import type { Card, TranscriptState } from "@/lib/types";
import { autoCards, cardsFromText, cardsToText, carryOver, matchRatio } from "@/lib/compile";
import { vocalizeText } from "@/lib/tashkeel";
import { Badge, Button, Panel, Spinner, Textarea } from "@/components/ui";

export function TextTab({ transcript, cards, audioDuration, onCards, onRetry, retrying }: {
  transcript: TranscriptState | null;
  cards: Card[];
  audioDuration: number;
  onCards: (c: Card[]) => void;
  onRetry: () => void;
  retrying: boolean;
}) {
  const words = useMemo(() => transcript?.words ?? [], [transcript]);
  const [text, setText] = useState(() => (cards.length ? cardsToText(cards) : ""));
  const deferred = useDeferredValue(text);
  const ratio = useMemo(() => (deferred.trim() && words.length ? matchRatio(deferred, words) : null), [deferred, words]);
  const status = transcript?.status ?? "idle";

  function auto() {
    const c = autoCards(words);
    onCards(carryOver(cards, c));
    setText(cardsToText(c));
  }
  function sync() {
    const c = cardsFromText(text, words, audioDuration);
    onCards(carryOver(cards, c));
    setText(cardsToText(c));
  }
  function handleVocalize() {
    const next = vocalizeText(text);
    setText(next);
    if (words.length) {
      const c = cardsFromText(next, words, audioDuration);
      onCards(carryOver(cards, c));
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="التفريغ الآلي"
        actions={status === "done" || status === "error" ? <Button size="sm" variant="ghost" onClick={onRetry} loading={retrying}><RefreshCw className="size-3.5" />إعادة التفريغ</Button> : null}
      >
        {status === "running" || status === "idle" ? (
          <div className="flex items-center gap-3 text-sm text-stone-600">
            <Spinner className="text-accent" />
            <span>جارٍ تفريغ الصوت بالذكاء الاصطناعي… عادةً أقل من دقيقة.</span>
          </div>
        ) : status === "error" ? (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">تعذّر التفريغ</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-xs" dir="auto">{transcript?.error}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="arabic-text rounded-lg bg-stone-50 px-3 py-2 text-[15px] text-stone-700">{transcript?.text}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <Badge tone="teal">{words.length} كلمة</Badge>
              {transcript?.model ? <span>النموذج: {transcript.model}</span> : null}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="النص كما سيظهر في الفيديو">
        <div className="space-y-3">
          <ul className="grid gap-1 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-6 text-stone-600 sm:grid-cols-2">
            <li>• كل سطر هنا = سطر في الفيديو</li>
            <li>• سطر فاضي = كارت (شاشة) جديد</li>
            <li>• سطر يبدأ بـ <b className="font-mono">#</b> = عنوان الكارت (لا يُقرأ)</li>
            <li>• سطر يبدأ بـ <b className="font-mono">&gt;</b> = المصدر أسفل الكارت</li>
          </ul>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={12}
            dir="rtl"
            className="arabic-text min-h-64 text-[16px]"
            placeholder={"# قَالَ رَسُولُ اللَّهِ ﷺ:\n«إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ،\nوَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى»\n> رَوَاهُ الْبُخَارِيُّ وَمُسْلِمٌ"}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={sync} disabled={status !== "done" || !text.trim()}>
              <Wand2 className="size-4" />
              مزامنة النص مع الصوت
            </Button>
            <Button variant="secondary" onClick={handleVocalize} disabled={!text.trim()}>
              <Feather className="size-4" />
              تشكيل تلقائي للكلمات
            </Button>
            <Button variant="secondary" onClick={auto} disabled={status !== "done" || !words.length}>
              <Sparkles className="size-4" />
              تقسيم تلقائي من التفريغ
            </Button>
            {ratio !== null ? (
              <span className="ms-auto text-xs text-stone-500">
                التطابق مع الصوت: <b className={ratio > 0.8 ? "text-emerald-700" : ratio > 0.5 ? "text-amber-700" : "text-red-600"}>{Math.round(ratio * 100)}%</b>
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-stone-500">
            الصق النص المشكَّل الصحيح وقسّمه كما تحب، ثم اضغط «مزامنة» — سيتم ربط كل كلمة بتوقيتها في الصوت تلقائيًا. تقدر بعدها تضبط التوقيت يدويًا من تبويب «الترجمة».
          </p>
        </div>
      </Panel>
    </div>
  );
}
