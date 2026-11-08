"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button, Input, api, cx } from "@/components/ui";
import type { AssetItem } from "@/components/editor/IconPicker";

/** Flood-fill remove near-uniform background starting from image corners -> transparent PNG File */
async function cutoutCornerBackground(file: File, tolerance = 34): Promise<File> {
  if (file.type === "image/svg+xml") return file;
  const bitmap = await createImageBitmap(file);
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Sample corners
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  // If already transparent at corners, return as-is
  if (corners.some(idx => d[idx + 3] < 20)) return file;

  const br = d[0], bg = d[1], bb = d[2];
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (visited[p]) return;
    const i = p * 4;
    const dist = Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
    if (dist <= tolerance * 3) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (head < tail) {
    const p = queue[head++];
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x + 1 < w) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < h) push(x, y + 1);
  }

  ctx.putImageData(imgData, 0, 0);
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.png`, { type: "image/png" });
}

export function LibraryView({ initialAssets }: { initialAssets: AssetItem[] }) {
  const [assets, setAssets] = useState<AssetItem[]>(initialAssets);
  const [q, setQ] = useState("");
  const [autoCutout, setAutoCutout] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => assets.filter(a => !q.trim() || a.name.includes(q.trim()) || (a.description ?? "").includes(q.trim()) || a.id.includes(q.trim())),
    [assets, q]
  );

  async function autoDescribeAll() {
    setDescribing(true);
    setError(null);
    try {
      const updated = await api<AssetItem[]>("/api/assets/auto-describe", { method: "POST" });
      setAssets(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDescribing(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const raw of Array.from(files)) {
        const processed = autoCutout ? await cutoutCornerBackground(raw).catch(() => raw) : raw;
        fd.append("files", processed);
      }
      const added = await api<AssetItem[]>("/api/assets", { method: "POST", body: fd });
      setAssets(prev => [...added, ...prev]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveMeta(id: string, patch: { name?: string; description?: string }) {
    setAssets(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
    try {
      await api(`/api/assets/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setSavedId(id);
      setTimeout(() => setSavedId(cur => (cur === id ? null : cur)), 1500);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(a: AssetItem) {
    if (!confirm(`حذف الرسمة «${a.name}» من المكتبة؟`)) return;
    const prev = assets;
    setAssets(list => list.filter(x => x.id !== a.id));
    try {
      await api(`/api/assets/${a.id}`, { method: "DELETE" });
    } catch (e) {
      setAssets(prev);
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">مكتبة الرسومات</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            الرسومات التوضيحية المستخدمة في تصميم «شرح كرتوني» ({assets.length} رسمة)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={autoDescribeAll} loading={describing} title="إعطاء أسماء وأوصاف عربية تلقائياً للرسومات ليتمكن الذكاء الاصطناعي من اختيارها">
            <Sparkles className="size-4 text-accent" />
            تسمية ووصف للـ AI تلقائياً
          </Button>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-stone-700 select-none">
            <input
              type="checkbox"
              checked={autoCutout}
              onChange={e => setAutoCutout(e.target.checked)}
              className="size-4 accent-[#154438]"
            />
            <Sparkles className="size-3.5 text-accent" />
            تفريغ الخلفية الموحدة تلقائياً
          </label>
          <Button onClick={() => fileRef.current?.click()} loading={uploading}>
            <ImagePlus className="size-4" />
            رفع صور جديدة
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mb-5 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ابحث باسم الرسمة أو وصفها..."
            className="ps-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-surface/60 px-6 py-16 text-center">
          <p className="font-semibold text-stone-700">لا توجد رسومات مطابقة</p>
          <p className="mt-1 text-sm text-stone-500">ارفع صوراً بصيغة PNG أو JPG أو WEBP لإضافتها إلى المكتبة.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map(a => (
            <li
              key={a.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-stone-300"
            >
              <div className="relative aspect-square w-full bg-[#FFF3DC] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.name}
                  className="h-full w-full object-contain mix-blend-multiply"
                  loading="lazy"
                />
                <button
                  onClick={() => remove(a)}
                  title="حذف الرسمة"
                  className="absolute top-2 left-2 rounded-lg bg-white/85 p-1.5 text-stone-500 opacity-100 shadow-xs transition hover:bg-red-50 hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-line p-2.5">
                <div className="flex items-center gap-1.5">
                  <input
                    key={`name-${a.id}-${a.name}`}
                    defaultValue={a.name}
                    placeholder="اسم الرسمة"
                    onBlur={e => {
                      if (e.target.value.trim() && e.target.value.trim() !== a.name) {
                        saveMeta(a.id, { name: e.target.value.trim() });
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className={cx(
                      "min-w-0 flex-1 rounded-md px-1.5 py-1 text-xs font-bold text-stone-800 transition",
                      "hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
                    )}
                  />
                  {savedId === a.id && <Check className="size-3.5 shrink-0 text-emerald-600" />}
                </div>
                <textarea
                  key={`desc-${a.id}-${a.description ?? ""}`}
                  defaultValue={a.description ?? ""}
                  rows={2}
                  placeholder="وصف للـ AI: متى يختار هذه الرسمة؟ (مثال: عند ذكر الصدقة، المال، الإنفاق)"
                  onBlur={e => {
                    if (e.target.value.trim() !== (a.description ?? "")) {
                      saveMeta(a.id, { description: e.target.value.trim() });
                    }
                  }}
                  className="w-full resize-none rounded-lg border border-stone-200/80 bg-stone-50/70 px-2 py-1 text-[11px] leading-relaxed text-stone-600 placeholder:text-stone-400 focus:border-accent focus:bg-white focus:outline-none"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 rounded-2xl border border-line bg-surface p-4 text-xs leading-6 text-stone-600">
        <strong className="text-stone-800">ملاحظة لتجهيز الرسومات:</strong> يفضّل أن تكون الرسومات بدون ذوات أرواح ذات ملامح (بدون وجوه/عيون) وبخطوط خارجية واضحة وألوان دافئة متناسقة مع الخلفية الكريمية. عند تفعيل خيار «تفريغ الخلفية الموحدة تلقائياً» سيقوم الاستوديو بإزالة اللون الموحد في أطراف الصورة وتحويلها إلى PNG شفاف فوراً.
      </div>
    </main>
  );
}
