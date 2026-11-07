"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { Check, FileAudio, UploadCloud } from "lucide-react";
import { TEMPLATES, type Project, type TemplateId } from "@/lib/types";
import { Button, Field, Input, Textarea, api, cx } from "@/components/ui";

export function NewProjectForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<TemplateId>("kids");
  const [file, setFile] = useState<File | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function pick(f?: File | null) {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }
  function onDrop(e: DragEvent) {
    e.preventDefault(); setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  }

  async function submit() {
    if (!file) { setError("اختر ملف الصوت أولًا"); return; }
    setError(null);
    try {
      setBusy("إنشاء المشروع…");
      const p = await api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ title, template }) });
      setBusy("رفع الصوت وتحليله…");
      const fd = new FormData();
      fd.append("file", file);
      if (referenceText.trim()) fd.append("referenceText", referenceText.trim());
      await api(`/api/projects/${p.id}/audio`, { method: "POST", body: fd });
      router.push(`/projects/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Field label="اسم المشروع">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: حديث حسن الظن بالله" />
      </Field>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-stone-700">التصميم</span>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(TEMPLATES) as TemplateId[]).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setTemplate(id)}
              className={cx("relative overflow-hidden rounded-xl border-2 text-start transition", template === id ? "border-accent" : "border-stone-200 hover:border-stone-300")}
            >
              <div className="relative aspect-[4/3] bg-stone-100">
                <Image src={TEMPLATES[id].thumb} alt="" fill sizes="300px" className="object-cover object-top" />
              </div>
              <div className="p-2.5">
                <div className="text-sm font-semibold text-stone-900">{TEMPLATES[id].name}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">{TEMPLATES[id].description}</div>
              </div>
              {template === id ? <span className="absolute top-2 start-2 grid size-6 place-items-center rounded-full bg-accent text-white"><Check className="size-3.5" /></span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-stone-700">التسجيل الصوتي</span>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => input.current?.click()}
          className={cx("flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 transition", drag ? "border-accent bg-accent-soft" : "border-stone-300 hover:border-stone-400")}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500">
            {file ? <FileAudio className="size-5" /> : <UploadCloud className="size-5" />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-stone-800">{file ? file.name : "اسحب الملف هنا أو اضغط للاختيار"}</div>
            <div className="text-xs text-stone-500">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "OGG · MP3 · M4A · WAV"}</div>
          </div>
          <input ref={input} type="file" accept="audio/*,.ogg,.opus" className="hidden" onChange={e => pick(e.target.files?.[0])} />
        </div>
      </div>

      <Field
        label="النص الأصلي للحديث أو الأثر (اختياري — يمنع أخطاء الاستماع نهائياً)"
        hint="إذا نسخت النص هنا، سيستخدم الاستوديو الصوت لاستخراج التوقيت فقط ويربطه بنصك الصحيح 100% دون أي أخطاء إملائية."
      >
        <Textarea
          rows={4}
          dir="rtl"
          value={referenceText}
          onChange={e => setReferenceText(e.target.value)}
          className="arabic-text text-[15px]"
          placeholder="الصق نص الحديث أو الأثر هنا (بالتشكيل أو بدونه)..."
        />
      </Field>

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 pt-1">
        {busy ? <span className="me-auto text-sm text-stone-500">{busy}</span> : null}
        <Button variant="ghost" onClick={onCancel} disabled={!!busy}>إلغاء</Button>
        <Button variant="primary" onClick={submit} loading={!!busy}>إنشاء وبدء التفريغ</Button>
      </div>
    </div>
  );
}
