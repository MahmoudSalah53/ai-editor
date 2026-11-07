"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileAudio, Minus, Plus, Trash2 } from "lucide-react";
import { TEMPLATES, type Project, type TemplateId } from "@/lib/types";
import { totalDuration } from "@/lib/compile";
import { Button, Field, Input, Modal, Panel, api, cx, fmtTime } from "@/components/ui";

const r1 = (n: number) => Math.round(n * 10) / 10;

export function SettingsTab({
  project,
  onChange,
  onAudioReplaced,
  onSeek,
}: {
  project: Project;
  onChange: (p: Partial<Project>) => void;
  onAudioReplaced: () => void;
  onSeek?: (t: number) => void;
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = project.timing;
  const audioDur = project.audio?.duration ?? 0;

  async function replace(f?: File) {
    if (!f) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      await api(`/api/projects/${project.id}/audio`, { method: "POST", body: fd });
      onAudioReplaced();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function remove() {
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Panel title="المشروع">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المشروع">
            <Input value={project.title} onChange={e => onChange({ title: e.target.value })} />
          </Field>
          <Field label="اسم القناة" hint="يظهر في المقدمة وأعلى الفيديو — يفضل بالتشكيل">
            <Input value={project.channelName} onChange={e => onChange({ channelName: e.target.value })} dir="rtl" />
          </Field>
        </div>
      </Panel>

      <Panel title="التصميم">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.keys(TEMPLATES) as TemplateId[]).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ template: id })}
              className={cx(
                "rounded-xl border-2 p-3 text-start transition",
                project.template === id ? "border-accent bg-accent-soft/40" : "border-stone-200 hover:border-stone-300"
              )}
            >
              <div className="text-sm font-semibold text-stone-900">{TEMPLATES[id].name}</div>
              <div className="mt-1 text-xs text-stone-500">{TEMPLATES[id].description}</div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="التوقيت">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumField
            label="المقدمة الصامتة"
            value={t.intro}
            min={0}
            max={10}
            onChange={v => {
              onChange({ timing: { ...t, intro: v } });
              onSeek?.(v > 0.2 ? Math.min(1.5, v * 0.5) : 0);
            }}
          />
          <NumField
            label="انتظار بعد الصوت"
            value={t.hold}
            min={0}
            max={10}
            onChange={v => {
              onChange({ timing: { ...t, hold: v } });
              onSeek?.(t.intro + audioDur + v * 0.5);
            }}
          />
          <NumField
            label="مدة الإظلام"
            value={t.fade}
            min={0.2}
            max={10}
            onChange={v => {
              onChange({ timing: { ...t, fade: v } });
              onSeek?.(t.intro + audioDur + t.hold + v * 0.5);
            }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <span>تُطبّق التعديلات فوراً على المعاينة الحية وتصدير الفيديو.</span>
          <span className="font-semibold text-stone-800" dir="rtl">
            إجمالي مدة الفيديو: {totalDuration(project).toFixed(1)} ثانية
          </span>
        </div>
      </Panel>

      <Panel title="الصوت">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-stone-100 text-stone-500">
            <FileAudio className="size-5" />
          </span>
          <div className="text-sm">
            <div className="font-medium text-stone-800">{project.audio?.file ?? "لا يوجد"}</div>
            {project.audio ? <div className="text-xs text-stone-500 tabular-nums">{fmtTime(project.audio.duration)}</div> : null}
          </div>
          <Button className="ms-auto" onClick={() => file.current?.click()} loading={uploading}>
            استبدال الصوت
          </Button>
          <input ref={file} type="file" accept="audio/*,.ogg,.opus" className="hidden" onChange={e => replace(e.target.files?.[0])} />
        </div>
        <p className="mt-3 text-xs text-amber-700">استبدال الصوت يمسح الترجمة الحالية ويبدأ تفريغًا جديدًا.</p>
        {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
      </Panel>

      <div className="flex justify-end">
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-4" />
          حذف المشروع
        </Button>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="حذف المشروع"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={remove}>
              حذف نهائي
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-600">سيتم حذف المشروع وكل ملفاته. لا يمكن التراجع.</p>
      </Modal>
    </div>
  );
}

function NumField({
  label,
  value,
  min = 0,
  max = 10,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) {
      onChange(r1(Math.min(max, Math.max(min, parsed))));
    }
    setDraft(null);
  };

  const stepBy = (delta: number) => {
    const next = r1(Math.min(max, Math.max(min, value + delta)));
    setDraft(null);
    onChange(next);
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-stone-600">
        <span>{label}</span>
        <span className="text-[11px] text-stone-400">ثانية</span>
      </div>
      <div className="flex items-center gap-1.5" dir="ltr">
        <button
          type="button"
          onClick={() => stepBy(-0.2)}
          disabled={value <= min}
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-100 disabled:opacity-40"
          aria-label="تقليل"
        >
          <Minus className="size-3.5" />
        </button>
        <input
          type="number"
          step={0.1}
          min={min}
          max={max}
          dir="ltr"
          value={draft ?? value}
          onChange={e => {
            setDraft(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(r1(Math.min(max, Math.max(min, v))));
          }}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 text-center text-sm font-semibold text-stone-900 tabular-nums focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15"
        />
        <button
          type="button"
          onClick={() => stepBy(0.2)}
          disabled={value >= max}
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-100 disabled:opacity-40"
          aria-label="زيادة"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
