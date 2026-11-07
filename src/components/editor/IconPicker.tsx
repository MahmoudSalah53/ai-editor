"use client";

import { useMemo, useRef, useState } from "react";
import { ImagePlus, Search } from "lucide-react";
import { Button, Input, Modal, api, cx } from "@/components/ui";

export interface AssetItem { id: string; name: string; url: string }

export function IconPicker({ open, onClose, assets, value, onPick, onUploaded }: {
  open: boolean; onClose: () => void; assets: AssetItem[]; value?: string; onPick: (id: string) => void; onUploaded: (a: AssetItem[]) => void;
}) {
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const list = useMemo(() => assets.filter(a => !q.trim() || a.name.includes(q.trim())), [assets, q]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append("files", f));
      const added = await api<AssetItem[]>("/api/assets", { method: "POST", body: fd });
      onUploaded(added);
      if (added.length === 1) { onPick(added[0].id); onClose(); }
    } finally { setUploading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="اختر رسمة" wide>
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-stone-400" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم" className="ps-9" />
        </div>
        <Button onClick={() => file.current?.click()} loading={uploading}><ImagePlus className="size-4" />رفع صورة</Button>
        <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files)} />
      </div>
      {list.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {list.map(a => (
            <li key={a.id}>
              <button
                onClick={() => { onPick(a.id); onClose(); }}
                className={cx("w-full overflow-hidden rounded-xl border-2 bg-[#FFF3DC] p-1 transition hover:border-accent", value === a.id ? "border-accent" : "border-transparent")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt="" className="aspect-square w-full object-contain mix-blend-multiply" loading="lazy" />
                <span className="block truncate px-1 pb-0.5 text-xs text-stone-700">{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-stone-500">لا توجد صور مطابقة.</p>
      )}
      <p className="mt-4 text-xs text-stone-500">أفضل نتيجة: صورة بخلفية بيضاء أو شفافة وبنفس الستايل الكرتوني.</p>
    </Modal>
  );
}
