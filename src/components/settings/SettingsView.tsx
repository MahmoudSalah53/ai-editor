"use client";

import { useState } from "react";
import { Check, Save } from "lucide-react";
import type { Settings } from "@/lib/types";
import { Button, Input, api, cx } from "@/components/ui";

const WHISPER_PRESETS = [
  { id: "large-v3-turbo", label: "large-v3-turbo (دقة عالية جداً للعربية — مثبت محلياً)" },
  { id: "D:\\Cache\\whisper\\small", label: "small (سريع وخفيف — مثبت محلياً)" },
];

export function SettingsView({ initial }: { initial: Settings }) {
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api<Settings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string, fallback: number) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-xl font-bold sm:text-2xl">الإعدادات العامة</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          تُطبّق هذه الإعدادات افتراضياً على المشاريع الجديدة وعمليات التفريغ والتصدير.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-bold text-stone-800">الهوية والتوقيت الافتراضي</h2>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              اسم القناة (يظهر في المقدمة الصامتة)
            </label>
            <Input
              value={form.channelName}
              onChange={e => setForm(f => ({ ...f, channelName: e.target.value }))}
              placeholder="عَرَفْتَ فَالْزَمْ"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                المقدمة الصامتة (ثانية)
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                dir="ltr"
                value={form.timing.intro}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    timing: { ...f.timing, intro: num(e.target.value, 3) },
                  }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                تثبيت بعد الصوت (ثانية)
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                dir="ltr"
                value={form.timing.hold}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    timing: { ...f.timing, hold: num(e.target.value, 1) },
                  }))
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-stone-600">
                تلاشي للسواد (ثانية)
              </label>
              <Input
                type="number"
                step="0.1"
                min="0.2"
                max="10"
                dir="ltr"
                value={form.timing.fade}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    timing: { ...f.timing, fade: num(e.target.value, 1.4) },
                  }))
                }
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-bold text-stone-800">التفريغ الصوتي والتصدير</h2>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              نموذج التعرف على الصوت (Faster-Whisper)
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {WHISPER_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, whisperModel: p.id }))}
                  className={cx(
                    "rounded-lg border px-2.5 py-1.5 text-xs transition",
                    form.whisperModel === p.id
                      ? "border-accent bg-accent/10 font-semibold text-accent"
                      : "border-line bg-stone-50 text-stone-600 hover:bg-stone-100"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Input
              dir="ltr"
              value={form.whisperModel}
              onChange={e => setForm(f => ({ ...f, whisperModel: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-stone-600">
              عدد مسارات التصدير المتوازية (1 إلى 6)
            </label>
            <Input
              type="number"
              min="1"
              max="6"
              dir="ltr"
              value={form.renderWorkers}
              onChange={e =>
                setForm(f => ({ ...f, renderWorkers: Math.round(num(e.target.value, 3)) }))
              }
            />
            <p className="mt-1 text-xs text-stone-500">
              زيادة العدد تسرّع تصدير الفيديو MP4 عبر توزيع المقاطع على عدة نوافذ متوازية (الافتراضي: 3).
            </p>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving}>
            <Save className="size-4" />
            حفظ الإعدادات
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <Check className="size-4" />
              تم الحفظ بنجاح
            </span>
          )}
        </div>
      </form>
    </main>
  );
}
