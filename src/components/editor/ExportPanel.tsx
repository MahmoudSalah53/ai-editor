"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, Film, Square } from "lucide-react";
import type { RenderState } from "@/lib/types";
import { Button, Progress, api, buttonClass } from "@/components/ui";

export function ExportPanel({ projectId, title, initial, canExport, beforeExport, updatedAt }: {
  projectId: string; title: string; initial: RenderState | null; canExport: boolean; beforeExport: () => Promise<void>; updatedAt: string;
}) {
  const [r, setR] = useState<RenderState>(initial ?? { status: "idle", progress: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (r.status !== "running") return;
    const id = setInterval(async () => {
      try { setR(await api<RenderState>(`/api/projects/${projectId}/render`)); } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [r.status, projectId]);

  async function start() {
    setErr(null); setStarting(true);
    try {
      await beforeExport();
      setR(await api<RenderState>(`/api/projects/${projectId}/render`, { method: "POST" }));
    } catch (e) { setErr((e as Error).message); }
    finally { setStarting(false); }
  }
  async function cancel() {
    setR(await api<RenderState>(`/api/projects/${projectId}/render`, { method: "DELETE" }));
  }

  const file = r.output ? `/api/files/projects/${projectId}/${r.output}` : null;
  const stamp = r.finishedAt ? new Date(r.finishedAt).getTime() : 0;
  const outdated = r.status === "done" && stamp && new Date(updatedAt).getTime() > stamp + 1000;
  const elapsed = r.startedAt ? Math.round((Date.now() - new Date(r.startedAt).getTime()) / 1000) : 0;

  return (
    <div className="mx-auto w-full max-w-[360px] space-y-3 rounded-xl border border-stone-200 bg-white p-3">
      {r.status === "running" ? (
        <div className="space-y-2">
          <div className="flex items-center text-sm">
            <span className="font-medium text-stone-800">جارٍ التصدير</span>
            <span className="ms-auto text-stone-500 tabular-nums">{Math.round(r.progress * 100)}%</span>
          </div>
          <Progress value={r.progress} />
          <div className="flex items-center text-xs text-stone-500">
            <span>{r.stage}</span>
            <span className="ms-auto tabular-nums">{elapsed > 0 ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : ""}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={cancel} className="w-full"><Square className="size-3.5" />إيقاف</Button>
        </div>
      ) : (
        <>
          {r.status === "done" && file ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <a href={`${file}?download=${encodeURIComponent(title)}.mp4`} className={buttonClass("primary", "md", "flex-1")}>
                  <Download className="size-4" />تحميل الفيديو
                </a>
                <a href={file} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "px-3")} aria-label="فتح الفيديو">
                  <ExternalLink className="size-4" />
                </a>
              </div>
              {outdated ? <p className="text-xs text-amber-700">عدّلت المشروع بعد آخر تصدير — صدّر من جديد لتحديث الفيديو.</p> : null}
            </div>
          ) : null}
          {r.status === "error" ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap" dir="auto">فشل التصدير: {r.error}</p> : null}
          {err ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p> : null}
          <Button variant={r.status === "done" ? "secondary" : "primary"} className="w-full" onClick={start} loading={starting} disabled={!canExport}>
            <Film className="size-4" />
            {r.status === "done" ? "تصدير من جديد" : "تصدير الفيديو MP4"}
          </Button>
          {!canExport ? <p className="text-center text-xs text-stone-500">أضف الترجمة أولًا لتفعيل التصدير.</p> : null}
        </>
      )}
    </div>
  );
}
