"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, FolderPlus, MoreVertical, Plus, Trash2 } from "lucide-react";
import type { ProjectSummary } from "@/lib/storage";
import { TEMPLATES } from "@/lib/types";
import { Badge, Button, EmptyState, Modal, api, fmtTime } from "@/components/ui";
import { NewProjectForm } from "./NewProjectForm";

export function ProjectsView({ projects, channelName }: { projects: ProjectSummary[]; channelName: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const busy = projects.some(p => p.transcript === "running" || p.render === "running");

  // keep running jobs fresh without manual reloads
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/api/projects/${toDelete.id}`, { method: "DELETE" });
      setToDelete(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-end gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">المشاريع</h1>
          <p className="mt-1 text-sm text-stone-500">{channelName} · {projects.length} مشروع</p>
        </div>
        <Button variant="primary" className="ms-auto" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          مشروع جديد
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderPlus className="size-5" />}
          title="لا توجد مشاريع بعد"
          text="ارفع تسجيلًا صوتيًا لحديث أو أثر، واختر التصميم، وسيتم تفريغ الكلام تلقائيًا."
          action={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" />ابدأ أول مشروع</Button>}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {projects.map(p => (
            <li key={p.id}>
              <ProjectCard p={p} onDelete={() => setToDelete(p)} />
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="مشروع جديد" wide>
        <NewProjectForm onCancel={() => setCreating(false)} />
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="حذف المشروع"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>إلغاء</Button>
            <Button variant="danger" loading={deleting} onClick={remove}><Trash2 className="size-4" />حذف نهائي</Button>
          </>
        }
      >
        <p className="text-sm text-stone-600">سيتم حذف «{toDelete?.title}» مع ملف الصوت والفيديو المُصدَّر. لا يمكن التراجع عن ذلك.</p>
      </Modal>
    </div>
  );
}

function ProjectCard({ p, onDelete }: { p: ProjectSummary; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const status =
    p.render === "running" ? <Badge tone="amber">تصدير {Math.round(p.progress * 100)}%</Badge>
    : p.transcript === "running" ? <Badge tone="amber">جاري التفريغ</Badge>
    : p.render === "done" ? <Badge tone="green">جاهز</Badge>
    : p.transcript === "error" || p.render === "error" ? <Badge tone="red">خطأ</Badge>
    : <Badge>مسودة</Badge>;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-stone-200 bg-white transition-shadow hover:shadow-md">
      <Link href={`/projects/${p.id}`} className="block">
        <div className="relative aspect-[9/12] overflow-hidden bg-stone-100">
          <Image src={TEMPLATES[p.template].thumb} alt="" fill sizes="(max-width: 768px) 50vw, 20vw" className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2 start-2">{status}</div>
          {p.duration ? <span className="absolute bottom-2 end-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white tabular-nums">{fmtTime(p.duration)}</span> : null}
        </div>
        <div className="p-3">
          <h3 className="truncate text-sm font-semibold text-stone-900">{p.title}</h3>
          <p className="mt-0.5 text-xs text-stone-500">{TEMPLATES[p.template].name} · {new Date(p.updatedAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</p>
        </div>
      </Link>
      <div className="absolute top-2 end-2">
        <button onClick={() => setMenu(m => !m)} onBlur={() => setTimeout(() => setMenu(false), 150)} className="grid size-8 place-items-center rounded-lg bg-white/90 text-stone-600 shadow-sm hover:text-stone-900" aria-label="خيارات">
          <MoreVertical className="size-4" />
        </button>
        {menu ? (
          <div className="absolute end-0 top-9 z-10 w-40 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 text-sm shadow-lg">
            {p.output ? (
              <a href={`/api/files/projects/${p.id}/${p.output}?download=${encodeURIComponent(p.title)}.mp4`} className="flex items-center gap-2 px-3 py-2 text-stone-700 hover:bg-stone-50">
                <Download className="size-4" /> تحميل الفيديو
              </a>
            ) : null}
            <button onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50">
              <Trash2 className="size-4" /> حذف
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
